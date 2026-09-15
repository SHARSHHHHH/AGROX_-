import re

legal_footer = '''
      {/* Legal Footer */}
      <div className="mt-8 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
        <strong>⚠️ Legal Disclaimer:</strong> This platform facilitates the tracking of terms and escrow payments for land leases. It does not replace formal legal registration. For leases of 12 months or longer, or year-to-year leases, the Registration Act, 1908 requires formal registration. Both parties are advised to consult with a legal professional to ensure compliance with local laws.
      </div>
'''

for file in ["frontend/src/pages/LandContractors.tsx", "frontend/src/pages/FarmerLand.tsx"]:
    with open(file, "r") as f:
        content = f.read()
    
    # insert before the last closing div
    idx = content.rfind("</div>\n  )\n}")
    if idx != -1:
        new_content = content[:idx] + legal_footer + content[idx:]
        with open(file, "w") as f:
            f.write(new_content)
