"""Central AI agent. Orchestrates tools, then asks the LLM to explain results
in the user's language. The LLM reasons and phrases; the TOOLS provide facts.

Flow: NLP analyze -> pick tools by intent -> gather real data ->
      build grounded context -> LLM explains -> translate to user language.
"""
import asyncio
from sqlalchemy.orm import Session
from app.ai import nlp
from app.ai.llm import chat
from app.models.models import Farm, SensorReading, SoilTest, Scheme
from app.services import weather as weather_svc
from app.services.recommendation import recommend_irrigation, analyze_soil
from app.services.schemes import recommend as recommend_schemes
from app.ml.knowledge import DISEASE_KB
from app.ml.pest_knowledge import PEST_KB
from app.services.pest_severity import assess_severity
from app.services.ipm import build_ipm, rank_sustainable_treatment
from app.services import cross_check as cc_svc


async def _latest_reading(db: Session, device_id: str):
    return (db.query(SensorReading)
            .filter(SensorReading.device_id == device_id)
            .order_by(SensorReading.created_at.desc()).first())


def compute_confidence(*, intent: str, data_used: list, tools_called: list,
                       facts: list, llm_failed: bool = False,
                       cross_check: dict = None) -> tuple:
    """Estimate how confident we are in this answer, 0-100.

    Deliberately simple and transparent: it sums how much REAL data the
    answer was grounded in, whether the LLM actually ran, whether
    cross-check was performed, and whether the intent is a concrete
    farming question vs generic chat. It is an honesty meter computed from
    what the agent REALLY did this turn, never a probability the model
    was asked to invent.

    Returns (score, reason). Both travel to the frontend, where the score is
    shown as a toggle on the message and the reason explains it in one line.
    """
    data_tools = {t for t in (tools_called or []) if t != "read_page_context"}
    evidence_tools = {
        "get_sensor_data", "get_soil_health", "get_weather",
        "get_irrigation_requirement", "get_disease_information",
        "get_fertilizer_recommendation", "match_symptoms_to_knowledge_base",
        "search_government_schemes", "check_scheme_eligibility",
        "identify_pest", "cross_check_sources", "cross_verify",
        "get_satellite_ndvi",
    }
    available = sum(1 for t in data_tools if t in evidence_tools)

    # Cross-check bonus: agreement across independent sources is the
    # strongest ground truth signal we have.
    cc = cross_check or {}
    cc_agreement = cc.get("agreement", 0)
    has_conflicts = bool(cc.get("conflicts"))
    cc_sources = len([s for s in cc.get("sources", []) if s.get("status") != "unknown"])

    # Data availability: 0-30 pts (more sources = higher; cross-check bump)
    avail_score = min(35, available * 7)
    if cc_sources >= 3:
        avail_score += 5

    # Source agreement: 0-25 pts (from the cross-check's own agreement score)
    agree_score = round(cc_agreement * 25)

    # LLM ran: 0-15 pts
    llm_score = 15 if not llm_failed else 5

    # Evidence richness: 0-15 pts (number of distinct data_used items)
    cite_score = min(15, len(data_used or []) * 3)

    # Intent specificity: 0-10 pts
    specific = (intent or "general") not in ("general",)
    spec_score = 10 if specific else 4

    score = min(98, max(5, avail_score + agree_score + llm_score + cite_score + spec_score))

    # Penalty for conflicts — they mean the sources disagree, which should
    # lower confidence even if every individual source is "good".
    if has_conflicts:
        score = max(5, score - 10)

    if llm_failed:
        reason = ("Advisor engine is offline; showing raw facts without the "
                  "AI explanation.")
    elif not data_used:
        reason = "No live farm data was available — this is generic guidance."
    elif has_conflicts and available >= 2:
        reason = (f"Based on {available} data source(s); note that some sources "
                  "disagree — see the breakdown for details.")
    elif available >= 3:
        reason = f"Grounded in {available} live data source(s), cross-verified."
    elif available >= 1:
        reason = f"Based on {available} live data source(s) plus the AI explanation."
    else:
        reason = "Based on the AI model's general knowledge; no farm data cited."

    return score, reason


def _facts_template(facts: list, lang: str) -> str:
    """Plain rendering of the grounded facts, used when the LLM is unavailable.

    Deliberately not translated here: these strings come from the
    deterministic engines in English, and machine-translating them without the
    LLM would risk changing a number or a recommendation. A short honest note
    is better than a mistranslated instruction.
    """
    useful = [f for f in facts
              if not f.startswith(("RULES", "You are", "Do NOT", "CRITICAL"))]
    if not useful:
        return ("The assistant is temporarily unavailable. Please try again in "
                "a moment.")

    header = ("The assistant is busy right now, so here is your farm data "
              "directly:")
    body = "\n".join(f"- {f}" for f in useful[:8])
    return f"{header}\n\n{body}"


async def run_agent(db: Session, user, message: str, page_context: str = "",
                    ui_language: str = "") -> dict:
    """Answer one farmer question, grounded in real data, in THEIR language.

    `page_context` is the screen the farmer is looking at, so the agent can
    answer "what does this mean?" without them re-stating the topic.

    `ui_language` is the language the farmer selected in the app. It takes
    priority over detecting the language from the message's script — see
    nlp.resolve_language() for why that matters so much for romanised input.
    """
    # Fall back to the language stored on the user record when the client did
    # not send one, so an older app build still gets a translated answer.
    ui_language = ui_language or getattr(user, "language", "") or ""

    # Instrumentation only — no behaviour change. See app/core/timing.py.
    from app.core.timing import StageTimer
    timer = StageTimer("CHAT")

    with timer.stage("intent detection"):
        analysis = await nlp.analyze(message, ui_language)
    lang = analysis["language"]
    intent = analysis["intent"]
    entities = analysis["entities"]

    farm = db.query(Farm).filter(Farm.user_id == user.id).first()
    crop = entities.get("crop") or (farm.crop if farm else "") or "your crop"
    device_id = farm.device_id if farm and farm.device_id else "ESP32-001"

    data_used = []          # transparency: what the agent looked at
    tools_called = []
    facts = []              # grounded facts fed to the LLM
    scheme_matches = []     # structured scheme data for frontend cards
    cross_check = {}        # multi-source agreement data (for Phase 2 UI)

    # ---- Live page context ----
    # The frontend tells us, in plain text, what the farmer is actually
    # looking at right now (the numbers/state currently rendered on their
    # screen) — not a re-fetch, the SAME data already on their page. This is
    # what lets "what is happening here?" or "why this number?" get a real,
    # page-specific answer instead of a generic one, on every page.
    if page_context:
        facts.append(f"What the user is currently looking at on screen: {page_context}")
        data_used.append("Live page context from the screen the user has open")
        tools_called.append("read_page_context")

    # ---- Tool selection by intent ----
    if intent in ("irrigation", "weather", "general"):
        # The sensor read hits the local DB and the weather call hits the
        # network. They do not depend on each other, so running them
        # sequentially just adds the two latencies together for no reason.
        with timer.stage("sensor + weather (concurrent)"):
            reading, wx = await asyncio.gather(
                _latest_reading(db, device_id), weather_svc.get_weather())
        tools_called += ["get_sensor_data", "get_weather"]
        if reading:
            data_used.append(f"Soil moisture {reading.soil_moisture}%, "
                             f"temp {reading.temperature}°C, humidity {reading.humidity}%")
            rec = recommend_irrigation(
                reading.soil_moisture, reading.temperature, reading.humidity,
                wx["rain_probability"], crop,
                farm.growth_stage if farm else "", farm.soil_type if farm else "")
            tools_called.append("get_irrigation_requirement")
            facts.append(f"Irrigation decision: {'IRRIGATE' if rec['irrigate'] else 'DO NOT irrigate'}. "
                         f"{rec['reason']} Priority {rec['priority']}.")
        data_used.append(f"Weather: {wx['condition']}, rain probability {wx['rain_probability']}%")
        facts.append(f"Weather interpretation: {wx['interpretation']}")

        # --- automatic cross-check (sensors + satellite + weather + soil) ---
        # Silently cross-references all available sources against the
        # irrigation decision. Conflicts become facts the LLM must explain
        # to the farmer, so they hear "the sensor says dry, but rain is
        # coming" rather than just "irrigate".
        try:
            with timer.stage("cross-check (concurrent)"):
                all_src = await cc_svc.gather_all_sources(db, user, farm, device_id)
            cc_result = cc_svc.cross_check_irrigation(all_src, crop)
            cross_check = cc_result
            tools_called.append("cross_check_sources")
            data_used.append("Multi-source cross-check (sensor+weather+satellite+soil)")
            if cc_result.get("conflicts"):
                for c in cc_result["conflicts"]:
                    facts.append(f"CROSS-CHECK CONFLICT: {c}")
            consensus = cc_result.get("consensus", "unknown")
            agr = cc_result.get("agreement", 0)
            facts.append(f"Multi-source consensus: {consensus} (agreement: {agr}). "
                         f"Sources checked: {', '.join(s['name'] for s in cc_result.get('sources', []))}")
        except Exception:                        # noqa: BLE001
            pass  # cross-check is best-effort; original answer still stands

    if intent == "soil":
        soil = (db.query(SoilTest).filter(SoilTest.user_id == user.id)
                .order_by(SoilTest.created_at.desc()).first())
        tools_called.append("get_soil_health")
        if soil:
            res = analyze_soil(soil.nitrogen, soil.phosphorus, soil.potassium, soil.ph, crop)
            data_used.append(f"Soil test: N {soil.nitrogen}, P {soil.phosphorus}, "
                             f"K {soil.potassium}, pH {soil.ph}")
            facts.append(f"Soil overall health: {res['overall']}. " +
                         " ".join(res["warnings"]) + " " + " ".join(res["suggestions"]))
        else:
            facts.append("No soil test on record. Advise the user to enter a soil "
                         "test or use a soil testing service.")

    if intent == "disease":
        # Agentic crop-problem detection from TEXT ALONE. Same shape as the
        # pest_management branch below: match the farmer's own words against
        # the verified knowledge base (deterministic, explainable), then let
        # the LLM phrase the top candidates — it never invents a disease name
        # that is not in DISEASE_KB, and never claims a confirmed diagnosis
        # without a photo.
        disease_hits = nlp.match_diseases(message, crop=entities.get("crop"))
        nutrient_hits = nlp.match_nutrient_deficiency(message)
        tools_called.append("match_symptoms_to_knowledge_base")

        if disease_hits:
            for h in disease_hits:
                facts.append(
                    f"Possible match from described symptoms: {h['disease']} "
                    f"(matched: {', '.join(h['matched_terms'])}). Typical "
                    f"symptoms: {h['symptoms']} Likely cause: {h['causes']} "
                    f"Prevention: {h['prevention']} Treatment: {h['treatment']}")
            facts.append(
                "This is a text-based match against known symptom patterns, "
                "NOT a confirmed diagnosis. Present it as 'possibly' or "
                "'symptoms consistent with', name the top match(es), give the "
                "prevention/treatment steps above, and still recommend "
                "uploading a clear photo on the Plant Health page to confirm.")
        if nutrient_hits:
            n = nutrient_hits[0]
            facts.append(
                f"Described symptoms are also consistent with a {n['nutrient']} "
                f"deficiency: {n['info']}")
        if not disease_hits and not nutrient_hits:
            facts.append(
                "The described symptoms did not clearly match a known disease "
                "or nutrient-deficiency pattern. Ask 1-2 clarifying questions "
                "(which part of the plant, leaf colour/pattern, spots vs "
                "wilting vs curling) and ask the user to upload a clear photo "
                "of the affected leaf on the Plant Health page for a confident "
                "diagnosis. Do not guess a disease name.")
        tools_called.append("get_disease_information")

    if intent == "pest_management":
        # Agentic tool orchestration for pests. The agent decides which tools it
        # needs: it always needs pest identity; if a pest is named it can run the
        # deterministic severity + IPM engines using real crop/weather context,
        # otherwise it must ask for an image (no guessing).
        named_pest = entities.get("pest")
        tools_called.append("identify_pest")

        # Gather environmental context (weather + latest sensor) as tools.
        # Independent calls, so gathered rather than chained.
        with timer.stage("sensor + weather (concurrent)"):
            wx, reading = await asyncio.gather(
                weather_svc.get_weather(), _latest_reading(db, device_id))
        environment = {"temperature": wx.get("temperature"),
                       "humidity": wx.get("humidity"),
                       "rain_probability": wx.get("rain_probability")}
        if reading:
            # Sensor humidity/temperature are more local than forecast; prefer them.
            environment["temperature"] = reading.temperature
            environment["humidity"] = reading.humidity
            data_used.append(f"Sensor: temp {reading.temperature}°C, humidity "
                             f"{reading.humidity}%")
            tools_called.append("get_sensor_data")
        data_used.append(f"Weather: {wx['condition']}, rain probability "
                         f"{wx['rain_probability']}%")
        tools_called.append("get_weather")

        if named_pest and named_pest in PEST_KB:
            growth_stage = farm.growth_stage if farm else ""
            # The agent cannot see an image here, so infestation is unknown; the
            # severity engine will honestly return an estimate/UNKNOWN and the IPM
            # engine still gives safe, preventive-first guidance.
            severity = assess_severity(
                pest_name=named_pest, confidence=0.7,
                visible_infestation="unknown", affected_leaf_pct=None,
                growth_stage=growth_stage, environment=environment)
            ipm = build_ipm(named_pest, severity["level"], environment)
            ranked = rank_sustainable_treatment(named_pest, severity["level"], ipm)
            tools_called += ["assess_pest_severity", "run_ipm_engine",
                             "rank_sustainable_treatment"]

            kb = PEST_KB[named_pest]
            facts.append(f"Pest in question: {named_pest}. Typical symptoms: "
                         f"{kb['symptoms']}")
            facts.append(f"Severity (without an image, estimated from context): "
                         f"{severity['level']}. {severity['reason']}")
            facts.append("Sustainable, least-harmful-first plan: " +
                         "; ".join(f"{s['category']}: {s['action']}"
                                   for s in ranked["ordered_steps"]))
            facts.append(f"Action threshold: {ipm['action_threshold']}")
            if ipm["chemical_status"] == "not_recommended":
                facts.append("Chemical pesticide is NOT recommended at this stage.")
            else:
                facts.append("Chemical control is only a threshold-gated last resort, "
                             "using locally registered products per the label.")
            facts.append("For a confirmed severity, ask the user to upload a photo on "
                         "the Pest Management page.")
        else:
            facts.append("To identify the pest and assess severity, an image is "
                         "required. Ask the user to upload a clear photo of the "
                         "affected leaves or the insect on the Pest Management page. "
                         "Do not guess a pest or recommend pesticides without "
                         "identification.")

    if intent == "scheme":
        schemes = db.query(Scheme).all()
        profile = {
            "state": user.state or (farm.state if farm else ""),
            "farmer_category": farm.farmer_category if farm else "small",
            "land_size_acres": farm.land_size_acres if farm else 1.0,
            "crop": crop if crop != "your crop" else "",
        }
        results = recommend_schemes(schemes, profile)
        eligible = [r for r in results if r["verdict"] in ("Likely eligible", "Possibly eligible")][:6]
        tools_called += ["search_government_schemes", "check_scheme_eligibility"]
        data_used.append(f"Analyzed {len(schemes)} schemes against your farm profile "
                         f"(state={profile['state']}, category={profile['farmer_category']}, "
                         f"land={profile['land_size_acres']} acres, crop={profile['crop'] or 'not set'})")
        for r in eligible:
            facts.append(f"{r['scheme_name']}: {r['verdict']}. {' '.join(r['why'][:2])} "
                         f"Apply: {r['url']}")
        if not eligible:
            facts.append("No schemes currently match your farm profile. "
                         "Try updating your Farm Setup with more details (state, crop, land size) "
                         "for better matches.")
        # Structured scheme data for the frontend to render as cards
        scheme_matches = [{
            "name": r["scheme_name"], "verdict": r["verdict"],
            "match_ratio": r["match_ratio"], "reasons": r["why"],
            "url": r["url"], "note": r["note"],
        } for r in eligible]

    if intent == "fertilizer":
        soil = (db.query(SoilTest).filter(SoilTest.user_id == user.id)
                .order_by(SoilTest.created_at.desc()).first())
        tools_called.append("get_fertilizer_recommendation")
        if soil:
            res = analyze_soil(soil.nitrogen, soil.phosphorus, soil.potassium, soil.ph, crop)
            facts.append("Fertilizer guidance: " + " ".join(res["suggestions"]))
        else:
            facts.append("No soil test available; recommend a balanced NPK and a "
                         "soil test for precise fertilizer advice.")

    if intent == "cross_verify":
        # The farmer is explicitly asking us to double-check something. We
        # pull ALL available data sources in parallel, then run either the
        # irrigation-specific cross-check (if the topic is irrigation-related)
        # or the general cross-check, and present the full source breakdown.
        with timer.stage("cross-verify: gather all sources"):
            all_src = await cc_svc.gather_all_sources(db, user, farm, device_id)
        tools_called += ["cross_verify", "get_sensor_data", "get_weather",
                         "get_soil_health", "get_satellite_ndvi"]
        if "sensor" in all_src:
            s = all_src["sensor"]
            data_used.append(f"Sensor: {s['soil_moisture']}%, {s['temperature']}°C, "
                             f"humidity {s['humidity']}%")
        if "weather" in all_src:
            w = all_src["weather"]
            data_used.append(f"Weather: {w.get('condition')}, rain {w.get('rain_probability')}%")
        if "satellite" in all_src:
            sa = all_src["satellite"]
            data_used.append(f"Satellite: NDVI {sa.get('ndvi')} ({sa.get('band')})")
        if "soil" in all_src:
            so = all_src["soil"]
            data_used.append(f"Soil: NPK {so['n']}-{so['p']}-{so['k']}, pH {so['ph']}")

        # Use the irrigation cross-check for farming decision topics, and the
        # generic cross-check for everything else.
        if entities.get("crop") or "irrigat" in message.lower() or "water" in message.lower():
            cc_result = cc_svc.cross_check_irrigation(all_src, crop)
        else:
            cc_result = cc_svc.cross_check_general(intent, all_src)
        cross_check = cc_result

        for src in cc_result.get("sources", []):
            facts.append(f"[{src['name'].upper()}] {src['detail']}")
        if cc_result.get("conflicts"):
            for c in cc_result["conflicts"]:
                facts.append(f"CROSS-CHECK CONFLICT: {c}")
        facts.append(
            f"Cross-verification consensus: {cc_result['consensus']} "
            f"(source agreement: {cc_result['agreement']}). "
            f"Based on {len(cc_result.get('sources', []))} independent data source(s).")

    # ---- LLM explanation grounded in facts ----
    #
    # ONE call, answering directly in the farmer's language.
    #
    # This previously made TWO sequential calls: generate in English, then call
    # translate() which calls the LLM again. On a cloud API that is merely
    # wasteful; on a local CPU model it doubles the wait, so a Tamil or Hindi
    # farmer waited twice as long as an English one for the same answer. It
    # also degraded quality, because a 1.5B model translating its own output
    # compounds any error in the first pass.
    grounded = "\n".join(f"- {f}" for f in facts) or "- No specific data available."
    lang_name = analysis["language_name"]

    system = (
        "You are an agricultural advisor for Indian farmers and home growers. "
        "Use ONLY the FACTS provided to answer — do not invent data, diseases, or "
        "scheme names. Be concise, practical and encouraging. Never claim absolute "
        "certainty: use 'likely'/'possible'. Structure: a direct answer, then a short "
        "reason, then what to do next. If a fact starting with 'What the user is "
        "currently looking at on screen' is present and the question asks what's "
        "happening, why a number/answer looks the way it does, or how you produced "
        "something, base your answer specifically on that fact rather than giving a "
        "generic explanation."
    )
    if lang != "en":
        # Repetition is deliberate. Smaller instruction-tuned models drift back
        # to English when the FACTS block they are grounded in is English —
        # which it always is here, because the deterministic engines compute in
        # English. Stating the constraint at the top of the system prompt, in
        # the user prompt, and as an explicit script requirement holds the line.
        script = {"hi": "Devanagari", "ta": "Tamil"}.get(lang, "")
        system += (
            f" CRITICAL LANGUAGE REQUIREMENT: write your ENTIRE reply in "
            f"{lang_name}"
            + (f", using {script} script" if script else "")
            + f". The FACTS below are given to you in English purely as data — "
              f"you must NOT copy English sentences into your answer. Translate "
              f"every part of your response, including headings, units and "
              f"advice, into {lang_name}. Do not reply in English. Do not add "
              f"an English translation alongside. Keep only crop, fertiliser "
              f"and government scheme proper names recognisable, and write "
              f"everything around them in {lang_name}."
        )

    user_prompt = (f"User question: {message}\n\nFACTS (source of truth):\n{grounded}\n\n"
                   f"Answer the user clearly"
                   + (f" in {lang_name}." if lang != "en" else "."))

    llm_failed = ""
    try:
        with timer.stage("Groq request"):
            answer = await chat(system, user_prompt, temperature=0.3)
    except Exception as exc:                            # noqa: BLE001
        # The grounded facts were computed deterministically BEFORE this call,
        # so a failed LLM costs us the phrasing, not the information. Showing
        # the farmer a plain rendering of correct facts beats an error page or
        # a four-minute wait.
        llm_failed = f"{type(exc).__name__}"
        timer.count_timeout("groq")
        timer.note(f"LLM unavailable ({llm_failed}); served deterministic facts")
        log.warning("[CHAT] LLM failed (%s); falling back to facts template",
                    llm_failed)
        answer = _facts_template(facts, lang)

    # Confidence is computed from what this turn actually did — how many real
    # data sources were used, whether the LLM delivered, and how specific the
    # question was. It feeds the per-answer confidence toggle in the UI.
    confidence_score, confidence_reason = compute_confidence(
        intent=intent, data_used=data_used, tools_called=tools_called,
        facts=facts, llm_failed=bool(llm_failed), cross_check=cross_check)

    return {
        "answer": answer,
        "language": lang,
        "language_name": analysis["language_name"],
        "language_source": analysis.get("language_source"),
        "timing": timer.finish(),
        "llm_failed": llm_failed or None,
        "intent": intent,
        "crop": crop,
        "tools_called": sorted(set(tools_called)),
        "data_used": data_used,
        "grounded_facts": facts,
        "scheme_matches": scheme_matches if intent == "scheme" else [],
        "confidence_score": confidence_score,
        "confidence_reason": confidence_reason,
        "cross_check": cross_check,
    }
