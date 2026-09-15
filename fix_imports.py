with open("frontend/src/pages/LandContractors.tsx", "r") as f:
    content = f.read()

content = content.replace("sendContractMessage", "sendContractMessage, proposeContractTerms, getContractTermsHistory, acceptContractTerms", 1)

with open("frontend/src/pages/LandContractors.tsx", "w") as f:
    f.write(content)
