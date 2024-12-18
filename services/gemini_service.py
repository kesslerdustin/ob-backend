import google.generativeai as genai
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch
import json
import sys
import os
from PIL import Image
import requests
from io import BytesIO
from dotenv import load_dotenv

load_dotenv()

# Configure the Gemini API
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

def generate_content(prompt):
    """Standard text generation"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        response = model.generate_content(prompt)
        return json.dumps({"success": True, "text": response.text})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def analyze_image(prompt, image_url):
    """Vision-based analysis"""
    try:
        # Load image from URL
        response = requests.get(image_url)
        img = Image.open(BytesIO(response.content))
        
        # Initialize vision model
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        response = model.generate_content([prompt, img])
        return json.dumps({"success": True, "text": response.text})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def search_and_generate(prompt):
    """Generation with Google Search grounding"""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        
        # Configure search tool
        google_search_tool = Tool(
            google_search=GoogleSearch()
        )
        
        # Generate with search capability
        response = model.generate_content(
            prompt,
            config=GenerateContentConfig(
                tools=[google_search_tool],
                response_modalities=["TEXT"],
            )
        )
        
        # Include both response and search metadata
        result = {
            "text": response.text,
            "search_data": response.candidates[0].grounding_metadata.search_entry_point.rendered_content
        }
        return json.dumps({"success": True, "data": result})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

if __name__ == "__main__":
    # Expected args: mode, prompt, [image_url]
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "Hello, Gemini!"
    image_url = sys.argv[3] if len(sys.argv) > 3 else None
    
    if mode == "vision":
        print(analyze_image(prompt, image_url))
    elif mode == "search":
        print(search_and_generate(prompt))
    else:
        print(generate_content(prompt)) 