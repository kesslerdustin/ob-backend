import google.generativeai as genai
import json
import sys
import os
from dotenv import load_dotenv

load_dotenv()

# Configure the Gemini API
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

def generate_response(prompt):
    try:
        # Initialize the model
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        
        # Generate content
        response = model.generate_content(prompt)
        return json.dumps({"success": True, "text": response.text})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

if __name__ == "__main__":
    # Read prompt from command line argument
    prompt = sys.argv[1] if len(sys.argv) > 1 else "Hello, Gemini!"
    print(generate_response(prompt)) 