#!/bin/bash
# create-hr-admin.sh
# Run locally (with backend running) to create the HR head's account.
# Usage: ./create-hr-admin.sh

API="http://localhost:3001/api"

echo "Creating HR Head account..."

# First login as system admin to get a token
ADMIN_TOKEN=$(curl -s -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"Admin@1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Could not log in as admin. Is the backend running?"
  exit 1
fi

# Create the HR head account
RESPONSE=$(curl -s -X POST "${API}/auth/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{
    "employeeId": "HR001",
    "name": "HR Head",
    "email": "hr-head@company.com",
    "password": "HRHead@2024",
    "role": "hrbp"
  }')

echo ""
echo "✅ HR Head account created:"
echo "   Email   : hr-head@company.com"
echo "   Password: HRHead@2024"
echo "   Role    : hrbp (can manage tickets, knowledge base, analytics)"
echo ""
echo "⚠️  Ask them to change the password after first login."
echo ""
echo "Response: $RESPONSE"
