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

def extract_json_from_text(text):
    """Extract JSON from text by finding the first valid JSON object"""
    try:
        # Find the first '{' and last '}'
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            # Extract potential JSON string
            json_str = text[start_idx:end_idx + 1]
            
            # Remove any non-JSON text that might be inside
            # This regex pattern matches common natural language interruptions
            import re
            # Remove any text that's not part of valid JSON structure
            cleaned = re.sub(r'(?<![\{\[,:\s])"(?![,:\}\]\s]).*?(?<![\{\[,:\s])"(?![,:\}\]\s])', '', json_str)
            # Remove any remaining non-JSON characters
            cleaned = re.sub(r'[^\{\}\[\]",:0-9a-zA-Z\s_-]', '', cleaned)
            # Fix any double spaces
            cleaned = re.sub(r'\s+', ' ', cleaned)
            
            # Try to parse the cleaned string
            return json.loads(cleaned)
    except Exception as e:
        print(f"JSON extraction failed: {e}")
        print(f"Original text: {text}")
        return None

def analyze_image(prompt, image_path, options=None):
    """Vision-based analysis with raw text output"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        analysis_type = options.get('type', 'photo_analysis')
        context = options.get('context', '')

        # Different prompts based on analysis type
        if analysis_type == 'chat_analysis':
            structured_prompt = f"""
            You are a helpful outdoor guide. Analyze this image and respond in the language of this classifier:{language} (eg: en - english, de - german, fr - french, etc).
            
            Context from the conversation:
            {context}
            
            Provide a natural, conversational response about what you see in the image.
            Focus on relevant outdoor, nature, or location-related details.
            Keep the response friendly and informative, as if chatting with a hiking companion.
            """
        else:
            # Original photo analysis prompt
            structured_prompt = f"""
            Analyze this image and respond ONLY in {language} language with a valid JSON object.
            
            CRITICAL REQUIREMENTS:
            1. Use ONLY the {language} language for ALL text fields
            2. Return EXACTLY this JSON structure:
            {{
                "response_mime_type": "application/json",
                "data": {{
                    "category": "POI|Flora|Fauna|Fungi|Custom",
                    "name": "{language} name/title",
                    "description": "detailed {language} description"
                }}
            }}
            """

        # Handle image loading
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

        return json.dumps({
            "success": True,
            "text": response.text
        })
    except Exception as e:
        print(f"Error in analyze_image: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

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

def flash_chat(prompt, image_path=None, options=None):
    """Flash chat generation using Gemini 2.0 with optional image support"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        context = options.get('context', '')
        
        # Make language instruction more explicit and move it to the end
        localized_prompt = f"""
        You are a helpful outdoor guide and survival expert. You have detailed information about the user's location, time, season, weather, surroundings, and possibly a satellite view of their position. Be precise, logical and helpful, and incorporate this contextual information naturally into your responses when relevant. Only do so, if it makes sense. Be aware of past messages and context and dont repeat yourself except if its really necessary!.

        Context about the current location and conditions:
        {context}
        
        User message: {prompt}

        CRITICAL: Respond in {language} language WITHOUT including the language code. Never start your response with language codes like 'de:', 'en:', etc. Also do not give any introduction, reply only with the answer.
        """

        # Prepare content list
        contents = [localized_prompt]

        # Add image if provided
        if image_path:
            try:
                if image_path.startswith(('http://', 'https://')):
                    response = requests.get(image_path)
                    image_data = BytesIO(response.content)
                    img = Image.open(image_data).convert('RGB')
                else:
                    img = Image.open(image_path).convert('RGB')
                contents.append(img)
            except Exception as e:
                print(f"Error loading image: {str(e)}", file=sys.stderr)

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=contents
        )
        
        return json.dumps({
            "success": True,
            "text": response.text
        })
    except Exception as e:
        print(f"Flash chat error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def analyze_biome(prompt, options=None):
    """Specialized biome analysis using Gemini 2.0"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        coordinates = options.get('coordinates', {})
        
        structured_prompt = f"""
        You are a biome classification expert. For this location:
        {prompt}
        
        Return ONLY:
        1. The primary biome name (e.g., Temperate broadleaf and mixed forests, Tropical rainforest, etc.)
        2. Followed by 2-3 major geographic features in parentheses, separated by commas
        
        Example format:
        Temperate broadleaf and mixed forests (rolling hills, river valleys, coastal cliffs)
        
        CRITICAL REQUIREMENTS:
        - You MUST respond in {language} language (if {language}='de', use German)
        - Translate BOTH the biome name AND features to {language}
        - Use ONLY the format shown above
        - No additional text or explanations
        - Keep feature descriptions very brief (1-2 words each)
        
        Remember: The ENTIRE response must be in {language} language!
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        return json.dumps({
            "success": True,
            "text": response.text.strip()
        })
    except Exception as e:
        print(f"Biome analysis error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def analyze_weather(prompt, options=None):
    """Weather analysis using Gemini 2.0"""
    try:
        # Parse options if provided
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        print(f"Gemini Service: Starting weather analysis with language: {language}", file=sys.stderr)
        
        structured_prompt = f"""
        You will receive some information about a location, current weather and a forecast. 
        Give your expertise on whether or not dangerous weather or circumstances will appear. 
        What to look out for / prepare for when a person is outside (hiking, traveling, etc). 
        Make it 2-4 sentences.

        Weather Information:
        {prompt}

        CRITICAL REQUIREMENTS:
        - Respond in {language} language ONLY! DO NOT give any introduction, reply only with the answer.
        - Keep response between 2-4 sentences
        - Focus on safety and preparation
        - Be direct and practical
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        return json.dumps({
            "success": True,
            "text": response.text.strip()
        })
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result))
        return error_result["error"]

def analyze_info(prompt, options=None):
    """Information analysis using Gemini 2.0 with enhanced prompt structure"""
    try:
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        description = options.get('description', '')
        location = options.get('location', '')
        date = options.get('date', '')
        
        structured_prompt = f"""
        Analyze this query and provide detailed information following these rules:
        
        Search Term: {prompt}
        Language: {language} (eg: de = german response, en = english response)
        Description: {description}
        Location: {location}
        Date: {date}

        CRITICAL REQUIREMENTS:
        1. Return EXACTLY this JSON structure:
        {{
          "general": {{
            "title": "General Description",
            "content": "A brief description in HTML format"
          }},
          "quickFacts": {{
            "title": "Quick Facts",
            "content": "<ul><li>Key fact 1</li><li>Key fact 2</li>...</ul>"
          }},
          "stats": {{
            "title": "Stats",
            "content": "<ul><li>Relevant statistics...</li></ul>"
          }},
          "howToSpot": {{
            "title": "How to Spot",
            "content": "Location and identification tips"
          }},
          "ratings": {{
            "title": "Ratings",
            "content": {{
              "categoryName": {{
                "title": "Category Title",
                "score": 0-10,
                "explanation": "Detailed explanation with seasonal context"
              }},
              // Add more rating categories as needed
            }}
          }},
          "history": {{
            "title": "History",
            "content": "Historical information with local relevance"
          }}
        }}

        2. Use HTML formatting with <b> tags for key terms
        3. Include historical information when possible
        4. Add seasonal relevance to ratings
        5. Reference survival techniques in <b> tags

        Adapt content based on query type:
        - For Species: Include population, lifespan, extinction rating, family/order
        - For Locations: Include area, population, founding year, attractions
        - For Survival Techniques: Include step-by-step instructions, use cases
        - For General Terms: Focus on description and quick facts

        Rating categories by type:
        - Species: danger, food source, fire material, etc.
        - Locations: accessibility, attractions, natural beauty, etc.
        - Survival Techniques: difficulty, effectiveness, time investment, etc.

        All content must be in {language} language (eg: de = german response, en = english response).
        All ratings must be on a 0-10 scale with detailed explanations.
        Include seasonal relevance where applicable.
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        # Find the first '{' and last '}' to extract JSON content
        text = response.text
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            json_content = text[start_idx:end_idx + 1]
            return json.dumps({
                "success": True,
                "text": json_content
            })
        else:
            raise Exception("No JSON content found in response")
            
    except Exception as e:
        print(f"Info analysis error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "Hello, Gemini!"
    image_url = sys.argv[3] if len(sys.argv) > 3 else None
    options = sys.argv[4] if len(sys.argv) > 4 else None
    
    # Update the response selection
    response = None
    if mode == "vision":
        response = analyze_image(prompt, image_url, options)
    elif mode == "search":
        response = search_and_generate(prompt)
    elif mode == "flash":
        response = flash_chat(prompt, image_url, options)
    elif mode == "biome":
        response = analyze_biome(prompt, options)
    elif mode == "weather":
        response = analyze_weather(prompt, options)
    elif mode == "info":
        response = analyze_info(prompt, options)
    else:
        response = generate_content(prompt)
    
    # Print the JSON response first
    print(response)
    
    # Then print debug info to stderr instead of stdout
    print(f"Python script received args: mode={mode}, prompt={prompt}, image={image_url}, options={options}", file=sys.stderr) 