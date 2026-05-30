# Deploy CDK stack
Set-Location -Path "C:\Users\micha\Desktop\turnkey-optimization\cdk"

# Install dependencies using python -m pip
python -m pip install -r requirements.txt -q

# Deploy with CDK
npx cdk deploy --require-approval never
