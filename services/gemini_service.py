from google import genai
import json
import sys
import os
from PIL import Image
import requests
from io import BytesIO
from dotenv import load_dotenv
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch

load_dotenv()

# Configure the Gemini API
client = genai.Client(api_key=os.getenv('GOOGLE_API_KEY'))
MODEL_ID = "gemini-2.0-flash-exp"

def generate_content(prompt):
    """Standard text generation"""
    try:
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt
        )
        return json.dumps({"success": True, "text": response.text})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def analyze_image(prompt, image_path, options=None):
    """Vision-based analysis with structured output"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        analysis_type = options.get('type', 'general')

        if analysis_type == 'photo_analysis':
            structured_prompt = f"""
            Analyze this image in {language} and provide a structured response.
            Focus on identifying if it's a point of interest (POI), flora, fauna, or fungi.
            Return ONLY a JSON object with the following structure:
            {{
                "category": "POI|Flora|Fauna|Fungi",
                "name": "specific name or title",
                "description": "detailed description"
            }}
            """
        else:
            structured_prompt = prompt

        # Handle image loading (existing code)
        if image_path.startswith(('http://', 'https://')):
            response = requests.get(image_path)
            image_data = BytesIO(response.content)
            img = Image.open(image_data).convert('RGB')
        else:
            img = Image.open(image_path).convert('RGB')
        
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=[structured_prompt, img]
        )

        # For photo analysis, ensure JSON response
        if analysis_type == 'photo_analysis':
            try:
                result = json.loads(response.text)
                return json.dumps({"success": True, "data": result})
            except json.JSONDecodeError:
                # Fallback if AI doesn't return proper JSON
                return json.dumps({
                    "success": True,
                    "data": {
                        "category": "Custom",
                        "name": "",
                        "description": response.text
                    }
                })
        
        return json.dumps({"success": True, "text": response.text})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def search_and_generate(prompt):
    """Generation with Google Search grounding"""
    try:
        
        
        google_search_tool = Tool(
            google_search=GoogleSearch()
        )
        
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
            config=GenerateContentConfig(
                tools=[google_search_tool],
                response_modalities=["TEXT"],
            )
        )
        
        # Extract main response text
        text = ""
        for part in response.candidates[0].content.parts:
            text += part.text

        # Get search metadata
        search_data = response.candidates[0].grounding_metadata.search_entry_point.rendered_content
        
        result = {
            "text": text,
            "search_data": search_data
        }
        return json.dumps({"success": True, "data": result})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "Hello, Gemini!"
    image_url = sys.argv[3] if len(sys.argv) > 3 else None
    
    if mode == "vision":
        print(analyze_image(prompt, image_url))
    elif mode == "search":
        print(search_and_generate(prompt))
    else:
        print(generate_content(prompt)) 