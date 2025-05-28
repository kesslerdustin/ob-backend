from google import genai
import json
import sys
import os
from PIL import Image
import requests
from io import BytesIO
from dotenv import load_dotenv
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch
from datetime import datetime
import re
from functools import wraps
import openai  # Add OpenAI import
import base64

load_dotenv()

# Configure the Gemini API
client = genai.Client(api_key=os.getenv('GOOGLE_API_KEY'))
FLASH_THINKING_MODEL = "gemini-2.0-flash-thinking-exp"
FLASH_MODEL = "gemini-2.0-flash-exp"
MODEL_ID = "gemini-2.0-flash-thinking-exp"  # Default model

# Configure OpenAI API
openai.api_key = os.getenv('OPENAI_API_KEY')

# Add this near the top with other config
FORCE_OPENAI = os.getenv('FORCE_OPENAI', 'false').lower() == 'true'

# Create an OpenAI client class that mimics the Gemini API
class OpenAIClient:
    def generate_content(self, model, contents, config=None):
        try:
            # Determine which OpenAI model to use based on the passed 'model' argument
            if model == "gpt-4o":
                openai_model = "gpt-4o"
                print("OpenAIClient: Using gpt-4o model.", file=sys.stderr)
            elif model == "gpt-4o-mini":
                openai_model = "gpt-4o-mini"
                print("OpenAIClient: Using gpt-4o-mini model.", file=sys.stderr)
            else:
                # Default fallback if model name is unexpected (e.g., a flash model name somehow got through)
                openai_model = "gpt-4o-mini"
                print(f"OpenAIClient: Unexpected model '{model}' received, defaulting to gpt-4o-mini.", file=sys.stderr)

            # Initialize better OpenAI system message for multimodal content
            has_image = False
            text_content = ""
            content_parts = []
            
            # Process contents - for multimodal support
            if isinstance(contents, list):
                for item in contents:
                    if isinstance(item, str):
                        # Plain text
                        text_content = item
                        content_parts.append({"type": "text", "text": item})
                    elif hasattr(item, 'text'):
                        # Text object
                        text_content = item.text
                        content_parts.append({"type": "text", "text": item.text})
                    elif isinstance(item, Image.Image):
                        # Handle PIL Image - this is critical for vision APIs
                        has_image = True
                        buffer = BytesIO()
                        item.save(buffer, format="JPEG")
                        base64_image = base64.b64encode(buffer.getvalue()).decode('utf-8')
                        content_parts.append({
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        })
            else:
                # Single content item
                if isinstance(contents, str):
                    text_content = contents
                    content_parts = [{"type": "text", "text": contents}]
                elif hasattr(contents, 'text'):
                    text_content = contents.text
                    content_parts = [{"type": "text", "text": contents.text}]
            
            # Choose appropriate system message based on content type
            system_message = "You are a helpful AI assistant that can analyze images in detail. When presented with an image, describe what you see clearly and thoroughly."
            
            messages = [
                {"role": "system", "content": system_message}
            ]
            
            # Add user message based on content type
            if has_image:
                messages.append({"role": "user", "content": content_parts})
            else:
                messages.append({"role": "user", "content": text_content})
            
            # Use the determined openai_model
            print(f"OpenAIClient: Calling OpenAI API with model: {openai_model}", file=sys.stderr)
            response = openai.chat.completions.create(
                model=openai_model, # Use the selected model
                messages=messages,
                temperature=0.7,
            )
            
            # Create a Gemini-like response object
            class Response:
                def __init__(self, text):
                    self.text = text
            
            return Response(response.choices[0].message.content)
        except Exception as e:
            print(f"OpenAI fallback error: {str(e)}", file=sys.stderr)
            raise

# Instantiate the OpenAI client
openai_client = OpenAIClient()

def with_model_fallback(primary_model):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            global MODEL_ID
            original_global_model_id = MODEL_ID 
            secondary_flash_model = FLASH_MODEL if primary_model == FLASH_THINKING_MODEL else FLASH_THINKING_MODEL
            
            try:
                # Try with the function's specific primary model
                MODEL_ID = primary_model
                print(f"Attempting {func.__name__} with primary model: {MODEL_ID}", file=sys.stderr)
                return func(*args, **kwargs)
            except Exception as e:
                # ANY exception from primary model triggers fallback to the *other* flash model
                print(f"Primary model ({primary_model}) failed for {func.__name__} ({type(e).__name__}: {e}), falling back to secondary flash model ({secondary_flash_model})", file=sys.stderr)
                try:
                    MODEL_ID = secondary_flash_model 
                    print(f"Retrying {func.__name__} with secondary model: {MODEL_ID}", file=sys.stderr)
                    return func(*args, **kwargs)
                except Exception as e2:
                    # Determine target OpenAI model based on the ORIGINAL primary model for this function
                    target_openai_model = "gpt-4o" if primary_model == FLASH_THINKING_MODEL else "gpt-4o-mini"
                    print(f"Secondary model ({secondary_flash_model}) failed for {func.__name__} ({type(e2).__name__}: {e2}), falling back to OpenAI model: {target_openai_model}", file=sys.stderr)
                    
                    # Monkey-patch the generate_content method temporarily
                    original_generate = client.models.generate_content
                    try:
                        # Temporarily use OpenAI client's method
                        client.models.generate_content = openai_client.generate_content
                        
                        # Set MODEL_ID to the target OpenAI model name for the retry
                        MODEL_ID = target_openai_model 
                        print(f"Retrying {func.__name__} with OpenAI client (passing model hint: {MODEL_ID})", file=sys.stderr)
                        # Retry the function call. The OpenAIClient will use the MODEL_ID hint.
                        return func(*args, **kwargs)
                    except Exception as e3:
                        # If OpenAI also fails, log and raise the OpenAI error
                        print(f"OpenAI fallback failed for {func.__name__}: {type(e3).__name__}: {e3}", file=sys.stderr)
                        raise e3 # Raise the OpenAI error
                    finally:
                        # Always restore the original generate_content method
                        client.models.generate_content = original_generate
                finally:
                    # Reset MODEL_ID after secondary flash model/OpenAI attempt
                    # Important: Reset to primary model *before* restoring global, 
                    # in case outer finally block needs it (though current logic doesn't).
                    MODEL_ID = primary_model 
            finally:
                # Restore the original global MODEL_ID after all attempts
                MODEL_ID = original_global_model_id
        return wrapper
    return decorator

@with_model_fallback(primary_model=FLASH_THINKING_MODEL)
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
        # First, try to parse the text directly as JSON
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            pass
        
        # Remove common markdown formatting
        cleaned_text = text.replace('```json', '').replace('```', '').strip()
        
        # Try parsing the cleaned text
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            pass
        
        # Find the first '{' and last '}'
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            # Extract potential JSON string
            json_str = text[start_idx:end_idx + 1]
            
            # Try parsing without any cleaning first
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                pass
            
            # Ensure proper encoding of special characters
            json_str = json_str.encode('utf-8').decode('utf-8')
            
            # Try parsing after encoding fix
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                pass
            
            # Last resort: more aggressive cleaning (but preserve more characters)
            # Allow more characters that might be in quiz content
            cleaned = re.sub(r'[^\{\}\[\]",:0-9a-zA-Z\s_\-äöüßÄÖÜàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\.!?\(\)\'\/\\\n\r\t](?=(?:[^"]*"[^"]*")*[^"]*$)', '', json_str)
            cleaned = re.sub(r'\s+', ' ', cleaned)
            
            # Try to parse the cleaned string
            return json.loads(cleaned)
            
    except Exception as e:
        print(f"JSON extraction failed: {e}", file=sys.stderr)
        print(f"Original text (first 500 chars): {text[:500]}", file=sys.stderr)
        return None

def json_dumps_utf8(obj):
    """Helper function to ensure proper UTF-8 encoding in JSON responses"""
    return json.dumps(obj, ensure_ascii=False)

@with_model_fallback(primary_model=FLASH_THINKING_MODEL)
def analyze_image(prompt, image_path, options=None):
    """Vision-based analysis with structured output"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        
        # Handle image loading
        if image_path.startswith(('http://', 'https://')):
            response = requests.get(image_path)
            image_data = BytesIO(response.content)
            img = Image.open(image_data).convert('RGB')
        else:
            img = Image.open(image_path).convert('RGB')

        structured_prompt = f"""
        Analyze this image and provide the SINGLE most important or prominent subject.
        Focus on identifying any flora, fauna, fungi, or points of interest.
        
        You MUST return only ONE object in this exact JSON structure:
        {{
            "data": {{
                "category": "One of: POI, Flora, Fauna, Fungi, Custom",
                "subcategory": "Specific subcategory based on category",
                "name": "Common name or title in {language} only (example: de = german, en = english. etc), scientific name if applicable in parentheses after the common name",
                "description": "Detailed description in {language} only (example: de = german, en = english. etc do not include the language code in the response)"
            }}
        }}
        
        CRITICAL: 
        1. Return ONLY ONE object, focusing on the main subject
        2. Respond in {language} language, do not include the language code in the response
        3. When referring to measurements, use appropriate units (miles for English, km for German, etc)
        4. Do not include any markdown formatting or code blocks
        5. when returning a name, only return parenthesized scientific name if applicable, if no specific name is available, return the common name only and leave out the scientific name
        """

        # Use MODEL_ID instead of hardcoded model name to enable fallback
        response = client.models.generate_content(
            model=MODEL_ID,  # Change from "gemini-2.0-flash-exp" to MODEL_ID
            contents=[structured_prompt, img]
        )

        # Clean the response text to remove any markdown formatting
        clean_text = response.text.replace('```json', '').replace('```', '').strip()
        
        # Extract JSON from the cleaned text
        json_content = extract_json_from_text(clean_text)
        if not json_content:
            raise Exception("Failed to get valid response format")

        # Ensure we have the correct structure
        if not isinstance(json_content, dict) or 'data' not in json_content:
            raise Exception("Invalid response structure")

        return json.dumps({
            "success": True,
            "text": json.dumps(json_content)
        })
        
    except Exception as e:
        print(f"Error in analyze_image: {str(e)}", file=sys.stderr)
        return json.dumps({
            "success": False,
            "error": str(e)
        })

@with_model_fallback(primary_model=FLASH_THINKING_MODEL)
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

@with_model_fallback(primary_model=FLASH_MODEL)
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

        CRITICAL: Respond in {language} language WITHOUT including the language code. Never start your response with language codes like 'de:', 'en:', etc. Also do not give any introduction, reply only with the answer. When referring times or units of measurement, use the language of the user (miles in english, km in german, etc).
        """

        # Prepare content list
        contents = [localized_prompt]

        # Add image if provided and valid
        if image_path and image_path != 'NONE': # Check for None and the 'NONE' string
            try:
                if image_path.startswith(('http://', 'https://')):
                    response = requests.get(image_path)
                    image_data = BytesIO(response.content)
                    img = Image.open(image_data).convert('RGB')
                else:
                    img = Image.open(image_path).convert('RGB')
                contents.append(img)
            except Exception as e:
                # Log the error but continue without the image
                print(f"Error loading image '{image_path}': {str(e)}", file=sys.stderr)
                # Optionally, we could raise here if image processing is critical
                # raise Exception(f"Failed to process image: {e}")

        # Use MODEL_ID for the API call
        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded "gemini-2.0-flash-exp"
            contents=contents
        )
        
        return json.dumps({
            "success": True,
            "text": response.text
        })
    except Exception as e:
        print(f"Flash chat error: {str(e)}", file=sys.stderr) # Keep logging
        # Re-raise the exception for the decorator
        raise e

@with_model_fallback(primary_model=FLASH_MODEL)
def analyze_biome(prompt, options=None):
    """Specialized biome analysis using Gemini 2.0"""
    try:
        options = json.loads(options) if options else {}
        language = options.get('language', 'en')
        coordinates = options.get('coordinates', {})
        
        structured_prompt = f"""
        You are a biome classification expert. For this location:
        {prompt}
        If location includes a location, let that influence your biome description. if its just coordinates, try to estimate the biome based on the coordinates as good as possible.
        Return ONLY:
        1. The primary biome name (e.g., Temperate broadleaf and mixed forests, Tropical rainforest, desert etc.)
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

        # Use MODEL_ID for the API call
        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded "gemini-2.0-flash-exp"
            contents=structured_prompt
        )
        
        return json.dumps({
            "success": True,
            "text": response.text.strip()
        })
    except Exception as e:
        print(f"Biome analysis error: {str(e)}", file=sys.stderr) # Keep logging
        # Re-raise the exception for the decorator
        raise e

@with_model_fallback(primary_model=FLASH_MODEL)
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
        - IMPORTANT: When referring to measurements:
          * If input uses imperial units (°F, mph, ft), respond using imperial units
          * If input uses metric units (°C, km/h, m), respond using metric units
        - IMPORTANT: When referring to time:
          * If input uses 12-hour format (e.g., 4:03 PM), respond using 12-hour format
          * If input uses 24-hour format (e.g., 16:03), respond using 24-hour format
        - IMPORTANT: When referring to dates:
          * If input uses MM/DD/YYYY format, respond using that format
          * If input uses DD.MM.YYYY format, respond using that format
        - Maintain the same unit system, time format, and date format as provided in the input prompt
        """

        # Use MODEL_ID for the API call
        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded "gemini-2.0-flash-exp"
            contents=structured_prompt
        )
        
        return json.dumps({
            "success": True,
            "text": response.text.strip()
        })
        
    except Exception as e:
        # Log the error (optional, as decorator logs too)
        print(f"Weather analysis error: {str(e)}", file=sys.stderr)
        # Re-raise the exception for the decorator
        raise e

@with_model_fallback(primary_model=FLASH_THINKING_MODEL)
def analyze_info(prompt, options=None):
    """Information analysis using Gemini 2.0 with enhanced prompt structure"""
    try:
        # Add debug logging for incoming options
        print(f"Python analyze_info received options: {options}", file=sys.stderr)
        
        options = json.loads(options) if isinstance(options, str) else options or {}
        print(f"Python analyze_info parsed options: {options}", file=sys.stderr)
        
        language = options.get('language', 'en')
        description = options.get('description', '')
        location = options.get('location', '')
        date = options.get('date', '')
        
        print(f"Python analyze_info extracted values: language={language}, description={description}, location={location}, date={date}", file=sys.stderr)
        
        structured_prompt = f"""
        Analyze this query and provide detailed information following these rules. You are an expert in the field of nature and survival:
        
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
          "stats": {{
            "title": "Stats",
            "content": "<ul><li>Relevant statistics...</li></ul>"
          }},
          "quickFacts": {{
            "title": "Quick Facts",
            "content": "<ul><li>Key fact 1</li><li>Key fact 2</li>...</ul>"
          }},
          "history": {{
            "title": "History",
            "content": "Historical information with local relevance"
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
          }}
        }}

        2. Use HTML formatting with <b> tags for key terms
        3. Include historical information when possible
        4. Add seasonal relevance to ratings
        5. Reference survival techniques in <b> tags
        6. quickfacts should be different from stats and more like interesting facts or trivia

        Adapt content based on query type:
        - For Species: Include population, lifespan, extinction rating, family/order, closely related species, etc.
        - For Locations: Include area, population, founding year, attractions, etc.
        - For Survival Techniques: Include step-by-step instructions, use cases, etc.
        - For General Terms: Focus on description and quick facts

        Rating categories by type:
        - Fauna: danger, food source, chance of sighting (realistically), etc.
        - Flora: danger, food source, fire material, shelter material, etc.
        - Fungi: danger, food source, fire material, medicine, etc.
        - Locations: accessibility, attractions, natural beauty, etc.
        - Survival Techniques: difficulty, effectiveness, time investment, etc.

        All content must be in {language} language (eg: de = german response, en = english response). When referring times or units of measurement, use the language of the user (miles in english, km in german, etc).
        All ratings must be on a 0-10 scale with detailed explanations.
        Include seasonal relevance where applicable.
        """

        response = client.models.generate_content(
            model=MODEL_ID,
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
            # Raise specific error that bypasses fallback
            raise Exception("No JSON content found in analyze_info response")
            
    except Exception as e:
        # Check if it's the specific JSON extraction error
        if "No JSON content found in analyze_info response" in str(e):
            print(f"Info analysis JSON format error: {str(e)}", file=sys.stderr)
            # Return failure JSON directly
            return json.dumps({"success": False, "error": str(e)})
        else:
            print(f"Info analysis error: {str(e)}", file=sys.stderr)
            # Re-raise other exceptions for the decorator
            raise e

@with_model_fallback(primary_model=FLASH_MODEL)
def generate_scenarios(location_info, options=None):
    """Generate location-specific scenarios using Gemini 2.0"""
    try:

        
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        
        structured_prompt = f"""
        Based on this location information:
        {location_info}

        

        Generate 4 realistic survival scenarios that could occur in this specific environment.
        Each scenario should be uniquely suited to the location's characteristics, weather, and terrain.

        Return EXACTLY this JSON structure:
        {{
            "scenarios": [
                {{
                    "id": "scenario1",
                    "title": "Brief title in {language} (de = german, en = english )",
                    "description": "One-line description in {language} (de = german, en = english)",
                    "icon": "Select one: leaf-outline, triangle-outline, water-outline, sunny-outline, flash-outline, compass-outline"
                }},
                // 3 more scenarios following the same structure
            ]
        }}

        REQUIREMENTS:
        1. Each scenario must be realistic for the location
        2. Include environmental challenges specific to the area (maybe even known POIs)
        3. Consider seasonal weather patterns
        4. Incorporate local terrain features
        5. Response must be in {language} language
        6. Icons should match the scenario theme
        """

        # Use MODEL_ID for the API call
        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded "gemini-2.0-flash-exp"
            contents=structured_prompt
        )
        
        # Extract JSON from response
        json_content = extract_json_from_text(response.text)
        
        if not json_content:
            # This specific error should probably still be raised directly
            # as it's a formatting issue, not an API availability issue.
            # Fallback won't help here.
            raise Exception("Failed to generate valid scenario data")

        return json.dumps({
            "success": True,
            "text": json_content
        })
        
    except Exception as e:
        # Check if it's the specific JSON extraction error we raised
        if "Failed to generate valid scenario data" in str(e):
             print(f"Scenario generation JSON format error: {str(e)}", file=sys.stderr)
             # Return failure JSON directly for this specific error
             return json.dumps({"success": False, "error": str(e)})
        else:
            # Log other errors (like the 503)
            print(f"Scenario generation error: {str(e)}", file=sys.stderr)
             # Re-raise other exceptions for the decorator
            raise e

@with_model_fallback(primary_model=FLASH_MODEL)
def game_setup(settings_data, options=None):
    """Generate game setup using Gemini 2.0"""
    try:
        settings_dict = json.loads(settings_data) if isinstance(settings_data, str) else settings_data
        settings_data = settings_dict.get('settings', {})
        language = settings_dict.get('language', 'en')
        
        print(f"Game setup generating content in language: {language}", file=sys.stderr)
        
        # Get environmental context
        environmental_context = settings_data.get('environmentalContext', {})
        biome = environmental_context.get('biome', 'unknown')
        nearby_pois = environmental_context.get('nearbyPOIs', [])
        natural_features = environmental_context.get('nearbyNaturalFeatures', [])
        localWildlife = environmental_context.get('localWildlife', [])
        
        # Enhanced wildlife logging
        print(f"Processing wildlife data...", file=sys.stderr)
        local_wildlife = environmental_context.get('localWildlife', [])
        print(f"Found {len(local_wildlife)} wildlife entries", file=sys.stderr)
        
        # More detailed wildlife formatting
        wildlife_entries = []
        for species in local_wildlife[:10]:  # Limit to 10 species
            try:
                entry = f"  • {species['name']} ({species['scientificName']}) - {species['category']}"
                if 'distance' in species:
                    entry += f" - {species['distance']:.2f}km away"
                wildlife_entries.append(entry)
            except KeyError as e:
                print(f"Warning: Missing key in species data: {e}", file=sys.stderr)
                continue
        
        formatted_env_context = f"""
        Environmental Context:
        - Biome: {biome}
        - Closest City: {environmental_context.get('closestCity', {}).get('name', 'Unknown')} ({environmental_context.get('closestCity', {}).get('distance', 'Unknown')} away)
        - Nearby Points of Interest:
          {chr(10).join([f"  • {poi['name']} ({poi['coordinates']['latitude']}, {poi['coordinates']['longitude']})" for poi in nearby_pois[:5]])}
        - Natural Features:
          {chr(10).join([f"  • {feature['name']} ({feature['coordinates']['latitude']}, {feature['coordinates']['longitude']})" for feature in natural_features[:10]])}
        - Local Wildlife:
          {chr(10).join(wildlife_entries)}
        """
        
        print(f"Formatted environmental context:", file=sys.stderr)
        print(formatted_env_context, file=sys.stderr)
        
        # Get difficulty and scenario details
        difficulty = settings_data.get('difficulty', {}).get('id', 'normal')
        scenario_type = settings_data.get('scenario', {}).get('type', 'predefined')
        scenario_desc = (settings_data.get('scenario', {}).get('description') if scenario_type == 'custom' 
                        else settings_data.get('scenario', {}).get('details', {}).get('description', ''))
        custom_rules = settings_data.get('customRules', '')
        # Define difficulty requirements first
        difficulty_requirements = {
            'easy': """
                - health/hunger/thirst/stamina: Start at 100
                - injuries: Empty array
                - backpack: 5-7 useful items
                - options: Provide 3-4 clear, helpful options
                - introduction: Friendly, informative tone
                - progression: Slow, gradual improvement depending on player actions. easy to win. 
            """,
            'normal': """
                - health/hunger/thirst/stamina: Start at 90-100
                - injuries: Empty array
                - backpack: 3-4 basic items
                - options: Provide 2-3 realistic options
                - introduction: Neutral, realistic tone
                - progression: Slow, gradual improvement depending on player actions. medium to win. 
            """,
            'hard': """
                - health/hunger/thirst/stamina: Start at 70-90
                - injuries: Include 1 minor injury
                - backpack: 0-2 useless items
                - options: NO options array (player must type their own actions)
                - introduction: Challenging, tense tone
                - progression: Slow, gradual improvement depending on player actions. hard to win, requires careful actions. 
            """
        }
        
        # Get the requirements for the current difficulty
        current_difficulty_reqs = difficulty_requirements.get(difficulty, difficulty_requirements['normal'])
        
        formatted_settings = f"""
        Generate a survival scenario based on these settings and requirements. if custom scenario, adjust everything according to the scenario description:
        
        CRITICAL - CUSTOM RULES TO FOLLOW:
        {custom_rules}
        These custom rules MUST be followed in ALL responses. This is the highest priority instruction.
        CRITICAL DATE, TIME AND METRIC SYSTEM FORMATTING: IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN FAHRENHEIT OR MILES, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. CONVERSELY, IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN CELSIUS OR KILOMETERS, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. INLCUDING WALKED DISTANCES, DISTANCES BETWEEN POINTS OF INTEREST, ETC.
        GAME SETTINGS:
        Date and Time: {settings_data.get('datetime', '')} or if {scenario_desc} includes a date, use that date.
        Location: {settings_data.get('location', {}).get('name', 'Unknown')}
        Coordinates: Lat {settings_data.get('location', {}).get('coordinates', {}).get('latitude', 0)}, 
                    Long {settings_data.get('location', {}).get('coordinates', {}).get('longitude', 0)}
        Elevation: {settings_data.get('location', {}).get('elevation', 0)}m
        Weather: {settings_data.get('weather', '')} or if {scenario_desc} includes a date, use that date.
        Difficulty: {difficulty}
        Scenario: {scenario_desc}

        ENVIRONMENTAL CONTEXT (you can use this to get more information about the location and embed them in the scenario):

        {formatted_env_context}
        
        Return EXACTLY this JSON structure:
        {{
            "title": "Scenario Title",
            "introduction": "Introduction to the scenario like a story. what happened before, description of the situation and surroundings (5-7 sentences)",
            "health": <health>,
            "hunger": <hunger>,
            "thirst": <thirst>,
            "stamina": <stamina>,
            "injuries": [<injuries>],
            "goals": {{
                "main": "Clear main objective for the adventure",
                "subgoals": [
                    "Specific task 1",
                    "Specific task 2",
                    "Specific task 3"
                ],
                "completedSubgoals": []
            }},
            "totalDistance": 0,
            "options": [
                {{
                    "text": "Description of first choice (15-30 words)",
                    "nextScene": "uniqueSceneId1"
                }},
                {{
                    "text": "Description of second choice (15-30 words)",
                    "nextScene": "uniqueSceneId2"
                }},
                {{
                    "text": "Description of third choice (15-30 words)",
                    "nextScene": "uniqueSceneId3"
                }}
            ],
            "backpack": ["item1", "item2", "item3"]
        }}
        
        DIFFICULTY REQUIREMENTS:
        For difficulty = '{difficulty}':
        {current_difficulty_reqs}

        CRITICAL REQUIREMENTS:
        1. Response must be in {language} language
        2. Adapt narrative tone to difficulty level
        3. Ensure backpack items are relevant to scenario and location
        4. Goals should reflect scenario type and difficulty
        5. All text fields must use proper grammar and punctuation
        6. Weather and location should significantly influence the scenario
        7. ALWAYS include exactly 3 options for 'easy' and 'normal' difficulty
        8. Each option must have both 'text' and 'nextScene' properties
        9. nextScene IDs should be unique, lowercase, no spaces (e.g., 'highGround', 'findWater', 'buildShelter')
        10. Option text should be clear and actionable, describing the choice in detail
        CRITICAL DATE, TIME AND METRIC SYSTEM FORMATTING: IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN FAHRENHEIT OR MILES, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. CONVERSELY, IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN CELSIUS OR KILOMETERS, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. INLCUDING WALKED DISTANCES, DISTANCES BETWEEN POINTS OF INTEREST, ETC.
        
        """

        # Update how we access custom rules
        
        # Generate response using the formatted settings
        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded "gemini-2.0-flash-exp"
            contents=formatted_settings
        )
        
        print(f"game_setup raw response: {response.text}", file=sys.stderr)
        
        # Extract JSON from response
        json_content = extract_json_from_text(response.text)
        print(f"game_setup extracted JSON: {json_content}", file=sys.stderr)
        
        if not json_content:
            # Raise specific error that bypasses fallback
            raise Exception("Failed to generate valid game setup data")

        return json.dumps({
            "success": True,
            "text": json_content
        })
        
    except Exception as e:
        # Check if it's the specific JSON extraction error
        if "Failed to generate valid game setup data" in str(e):
             print(f"Game setup JSON format error: {str(e)}", file=sys.stderr)
             # Return failure JSON directly
             return json.dumps({"success": False, "error": str(e)})
        else:
            print(f"Game setup generation error: {str(e)}", file=sys.stderr)
            print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
            # Re-raise other exceptions for the decorator
            raise e

@with_model_fallback(primary_model=FLASH_THINKING_MODEL)
def game_master(context, options=None):
    """Process game turns using Gemini 2.0 with improved dynamic progression toward an ending,
       persistent and realistic injuries, and balanced challenge versus progress conditions."""
    try:
        context = json.loads(context) if isinstance(context, str) else context
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        
        # Get custom rules from context
        custom_rules = context.get('customRules', '')

        # Access environmental data directly from context
        environmental_context = context.get('environmentalContext', {})
        biome = environmental_context.get('biome', 'unknown')
        nearby_pois = environmental_context.get('nearbyPOIs', [])
        natural_features = environmental_context.get('nearbyNaturalFeatures', [])
        localWildlife = environmental_context.get('localWildlife', [])

        # Format environmental context more clearly
        formatted_env_context = f"""
        Environmental Context:
        - Biome: {biome}
        - Closest City: {environmental_context.get('closestCity', {}).get('name', 'Unknown')} ({environmental_context.get('closestCity', {}).get('distance', 'Unknown')} away)
        - Nearby Points of Interest:
          {chr(10).join([f"  • {poi['name']} ({poi['coordinates']['latitude']}, {poi['coordinates']['longitude']})" for poi in nearby_pois[:5]])}
        - Natural Features:
          {chr(10).join([f"  • {feature['name']} ({feature['coordinates']['latitude']}, {feature['coordinates']['longitude']})" for feature in natural_features[:10]])}
        - Local Wildlife:
          {chr(10).join([f"  • {species['name']} ({species['scientificName']})" for species in localWildlife[:10]])}
        """

        # Sanitize the player's action: Replace double quotes to avoid formatting issues.
        if 'currentTurn' in context and 'action' in context['currentTurn']:
            context['currentTurn']['action'] = context['currentTurn']['action'].replace('"', "'")
        
        # Retrieve the latest and current turn data.
        all_turns = context.get('turns', [])
        latest_turn = all_turns[-1] if all_turns else {}
        current_turn = context.get('currentTurn', {})
        difficulty = context.get('difficulty', 'normal')
        total_distance = latest_turn.get('totalDistance', 0)  # Accumulated distance

        # Determine the datetime using the last turn's datetime or fallback.
        current_datetime = latest_turn.get('datetime') or context.get('currentDateTime')
        try:
            parsed_datetime = datetime.fromisoformat(current_datetime.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            parsed_datetime = datetime.utcnow()

        # Build a concise version of the full turn history for context.
        full_turn_history = "\n".join(
            f"Turn {turn.get('turnNumber', i+1)}:\n"
            f"  Time: {turn.get('datetime', 'Unknown')}\n"
            f"  Player Action: {turn.get('action', 'None')}\n"
            f"  Location: {turn.get('location', 'Unknown')}\n"
            f"  Weather: {turn.get('weather', 'Unknown')}\n"
            f"  Inventory: {', '.join(turn.get('backpackInventory', []))}\n"
            f"  AI Narration: {turn.get('aiNarration', '')}\n"
            f"  Chosen Option: {turn.get('chosenOption', 'None')}\n"
            for i, turn in enumerate(all_turns)
        )

        

        # Build a comprehensive prompt for the AI.
        structured_prompt = f"""
        You are a world-class game master and survival expert. Your task is to evolve an immersive text-based survival adventure with realistic mechanics, adaptive narrative progression toward a good or bad ending, persistent and cumulative injuries, and a balanced level of environmental challenge.

        ENVIRONMENTAL CONTEXT (you can use this to get more information about the location and embed them in the scenario, help construct the world etc. only if it makes sense. Include species names into the scenario if it makes sense. When refereing species, pois, natural landmarks do not mention their gps coordinates but use them for spacial context):
        {formatted_env_context}
        The closest city is {environmental_context.get('closestCity', {}).get('name', 'Unknown')} ({environmental_context.get('closestCity', {}).get('distance', 'Unknown')} away). distances are from starting point.

        CRITICAL - CUSTOM RULES TO FOLLOW:
        {custom_rules}
        These custom rules MUST be followed in ALL responses. This is the highest priority instruction. the only things custom rules cannot overwrite are JSON structure and the rules when to set hasgameended to true.
CRITICAL DATE, TIME AND METRIC SYSTEM FORMATTING: IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN FAHRENHEIT OR MILES, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. CONVERSELY, IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN CELSIUS OR KILOMETERS, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. INLCUDING WALKED DISTANCES, DISTANCES BETWEEN POINTS OF INTEREST, ETC.
        
        Use the entire game state and history below to decide how the story develops. In particular:

        • If the player makes logical and careful decisions, the narrative should allow opportunities to slowly recover or progress—even under harsh conditions.
        • Conversely, if the player's decisions have been poor, the narrative must reflect mounting adversity with severe consequences.
        • Injuries must persist and become more severe over time (e.g., signs of hypothermia, frostbite, or cumulative physical damage) if the environment remains harsh or decisions worsen the condition.
        • The story's overall difficulty should reflect both the environmental challenges (heavy rain, cold, wind) and the player's actions, so that progress may be gradual if smart choices are made, but any poor decision accelerates the downfall.

        ---------------------------
        PLAYER INPUT & INTENT:
        ---------------------------
        Player Input: {current_turn.get('action', '')}
        Analyze whether the input is a QUESTION (requesting clarification) or an ACTION (attempting to change the game state). 
         If input is a QUESTION:
               - Return this exact JSON structure:
               {{
                   "isQuestion": true,
                   "answer": "Detailed, immersive response (3-5 sentences) based on observable conditions, time of day, weather, and surroundings. Include relevant survival knowledge when appropriate."
               }}
               - Consider visibility conditions, available light, weather impact
               - Include sensory details (sounds, smells, temperature)
               - Reference relevant survival expertise
               - Keep responses realistic and grounded
        IF input is an ACTION:
        • If the input is vague (e.g., "I improve the stick and try to burn it"), return a JSON with "isQuestion": true and ask for clarification details.
        • If the input is detailed (e.g., "I carefully carve feathersticks using my knife and arrange them optimally for catching sparks"), process it fully.
        • If the input is extremely unrealistic (e.g., "I find a helicopter" or "I jump off a 1000m cliff"), either request clarification or simulate severe, realistic consequences.

        ---------------------------
        GAME OVERVIEW:
        ---------------------------
        Title: {context.get('gameName', 'Unknown')}
        Difficulty: {difficulty}
        Scenario: {context.get('scenarioDescription', '')}
        Total Distance Traveled: {total_distance} km

        ---------------------------
        LOCATION & ENVIRONMENT:
        ---------------------------
        Current Position: {latest_turn.get('location', 'Unknown')}
        GPS Coordinates: Latitude {context.get('location', {}).get('coordinates', {}).get('latitude', 'Unknown')}, Longitude {context.get('location', {}).get('coordinates', {}).get('longitude', 'Unknown')}
        Elevation: {context.get('location', {}).get('elevation', 'Unknown')} m
        Local Time: {current_datetime}
        Weather: {latest_turn.get('weather', 'Unknown')}
        Note: Ensure that the environmental conditions are applied realistically and opportunities for partial recovery (or further decline) are clearly reflected.
        knowledge about starting position: {formatted_env_context}
        ---------------------------
        CURRENT STATUS:
        ---------------------------
        Health: {latest_turn.get('stats', {}).get('health', 100)}
        Stamina: {latest_turn.get('stats', {}).get('stamina', 100)}
        Hunger: {latest_turn.get('stats', {}).get('hunger', 100)}
        Thirst: {latest_turn.get('stats', {}).get('thirst', 100)}
        Inventory: {', '.join(latest_turn.get('backpackInventory', []))}
        Turns Remaining: {latest_turn.get('remainingTurns', 20)}
        Important: All previously incurred injuries must persist. In these harsh conditions, realistic injuries (e.g., hypothermia, Frostbite, Schnitte, Erschöpfung) should be included and may worsen if conditions remain unchanged.

        ---------------------------
        TURN HISTORY:
        ---------------------------
        {full_turn_history}

        ---------------------------
        GOALS & PROGRESSION:
        ---------------------------
        Main Goal: {context.get('goals', {}).get('main', '')}
        Active Subgoals: {', '.join(context.get('goals', {}).get('subgoals', []))}
        Completed Subgoals: {', '.join(context.get('goals', {}).get('completedSubgoals', []))}
        Critical: Based on previous turns and user decisions, indicate the overall narrative direction:
         - If the decisions have been wise, show a slow progression toward rescue or safety.
         - If the decisions have been poor, the situation should deteriorate toward a very hard, possibly fatal ending.

        ---------------------------
        CRITICAL REQUIREMENTS & MECHANICS:
        ---------------------------
        1. Response MUST be in {language} only.
        2. Do NOT allow players to force outcomes – they only specify WHAT to do; YOU decide HOW the action is resolved and its consequences.
        3. Identify the player's input as:
           - **QUESTION:** For clarifications about the surroundings or status.
           - **ACTION:** For tasks that alter the game state.
        4. If the action is vague, return JSON with "isQuestion": true and ask for further details.
        5. If the action is extremely unrealistic (e.g., "I find a helicopter" or "I jump off a 1000m cliff"), explain that such actions are nearly impossible under these conditions and either ask for clarification or simulate realistic, extreme consequences (e.g., immediate death).
        6. When processing an ACTION:
           - Apply realistic survival mechanics. For example, running in the dark with low stamina should risk severe falls, cumulative injuries (including signs of hypothermia or frostbite), and additional stat penalties.
           - Update the time based on realistic action duration.
           - Adjust player stats (health, stamina, hunger, thirst) accordingly and ensure injuries (and potentially other status effects like hypothermia) persist and worsen if not treated.
           - Update inventory accordingly: For example, when searching, randomly determine if useful items (e.g., an apple, first aid supplies) are found or if nothing is added.
           - Revise goals and subgoals dynamically. For example, successful crafting of feathersticks might generate the new subgoal "Entzünde ein Feuer, um deine Körpertemperatur zu steigern", while repeated poor decisions should update the narrative toward a fatal outcome.
           - Very importantly, indicate the overall narrative direction (good vs. bad ending) based on cumulative turns. If the player's decisions have been careful, the narrative should hint at a possibility of rescue or safety; if not, the narrative should accelerate decline.
           - Provide rich, atmospheric narration (3-5 sentences) that details:
               * The player's attempted action and how it was carried out.
               * The environmental challenges and specific consequences (including injuries, cold, and resource loss).
               * How these consequences move the narrative toward either a recovery/rescue scenario or a dangerous, possibly fatal end.
           - For EASY/NORMAL difficulties, provide a set of realistic consequence-based options to guide the next action. For HARD, omit the options.
        7. The JSON response for ACTION must exactly follow this schema:

        PROGRESSION AND ENDING:
        - depending on the difficulty, the progression and ending should be different. 
        - easy: slow, gradual improvement depending on player actions. easy to win. 
        - normal: slow, gradual improvement depending on player actions. medium to win. 
        - hard: slow, gradual improvement depending on player actions. hard to win, requires careful actions.
        - WIN / END possible before the 20th turn.  
        - Game Ends (send json with hasGameEnded: true) if any stat is 0 or a critical event (rescue, death) occurs OR the main goal is achieved and all subgoals are completed..
        - if after 20 turns (0 remaining turns) the game is not ended, the game should end with an ending that sums up the story and final stats (send json with hasGameEnded: true).

        JSON Schema for ACTION:
        {{
            "isQuestion": false,
            "health": <number between 0 and 100>,
            "stamina": <number between 0 and 100>,
            "hunger": <number between 0 and 100>,
            "thirst": <number between 0 and 100>,
            "injuries": [ "detailed_injury1", "detailed_injury2" ],
            "turnsRemaining": <number between 0 and 20>,
            "weather": "Detailed weather description with forecasted changes.",
            "narration": "Rich, atmospheric text (3-5 sentences) that describes the action, its consequences (including any injuries or status changes), and the overall narrative direction (i.e., progressing toward a rescue/safe ending or worsening conditions).",
            "location": {{
                 "name": "Detailed description of the new location",
                 "coordinates": {{
                      "latitude": <decimal_number>,
                      "longitude": <decimal_number>
                 }},
                 "elevation": <number>
            }},
            "datetime": "New ISO formatted datetime reflecting realistic action duration",
            "totalDistance": <updated total km traveled>,
            "goals": {{
                 "main": "Updated main objective text",
                 "subgoals": [ "Subgoal 1", "Subgoal 2", "Subgoal 3" ],
                 "completedSubgoals": [ "Completed subgoal 1" ]
            }},
            "hasGameEnded": <true/false>,   // True if any stat is 0 or a critical event (rescue, death, all goals completed) occurs OR if 0 remaining turns.
            "gameEndReason": <string or null>,  // Provide a detailed explanation if the game has ended.
            "options": [  // Only include for EASY/NORMAL difficulties.
                 {{
                      "id": "option1",
                      "text": "Description of a potential next action within the survival context",
                      "consequences": {{
                           "health": <number representing health change (negative value)>,
                           "description": "Realistic outcome explanation based on that decision"
                      }}
                 }},
                 // 2-3 additional options as appropriate.
            ],
            "backpack": [ "Updated inventory reflecting items used, consumed, or newly acquired" ]
        }}

        8. Apply realistic survival mechanics:
           - Calculate energy, time, and resource consumption according to the terrain, weather, and player's stamina.
           - Track tool degradation and consumable usage permanently.
           - Adjust hunger and thirst rates in proportion to the intensity of activity (heavy activity drains more).
           - Evolve environmental conditions naturally (weather changes, day/night cycles, ambient light, etc.).
        9. Enforce difficulty-specific rules:
           - HARD: Do NOT include an 'options' array; use stricter penalties, no starting utilities, and harsher resource depletion.
           - NORMAL: Provide 2 options which do give the player options but are not laying out the optimal solutions immediately. more focused on discovery, trial and error, etc.
           - EASY: Provide a thoughtfully considered options array to guide subsequent actions.
        10. Ensure that the adventure leads to either a good ending (rescue, safe shelter, goal attainment) or a bad ending (critical failure, death) based on cumulative decisions. If any stat reaches 0 or if critical injuries occur, mark the game as ended with a clear explanation in gameEndReason.
        11. Dynamic Consequences and Narrative Direction:
           - For repeated dangerous actions (like running in the dark with low stamina), enforce cumulative, severe consequences (such as hypothermia, frostbite, or worsening injuries).
           - When the player details logical, careful actions (like meticulous crafting of feathersticks), reward them with gradual progress toward a safe outcome.
           - Adapt the narrative's overall direction so that if the player's decisions have been good, the story hints at rescue or recovery; if poor, the narrative accelerates decline.

        12. Time and Event Progression Rules:
            - When a player waits for a specific event (e.g., someone's return), DO NOT just describe the waiting
            - Instead, after 1-2 turns of waiting:
                a) The expected event MUST happen (e.g., person returns) OR
                b) A clear indication must be given why it won't happen (e.g., "After 30 minutes, it becomes clear the worker won't return")
            - Progress the story with new developments, don't just describe the same situation
            - Time passing should have meaningful impact on:
                * Weather changes
                * Physical condition (cold, fatigue, etc.)
                * Resource consumption
                * Story progression

        13. Situation-Specific Logic:
            - Track how long specific events have been waiting to resolve
            - Apply realistic timeframes (e.g., a person shouldn't be "checking with supervisor" for hours)
            - If a situation becomes unrealistic (e.g., waiting too long), force a change:
                * Introduce new NPCs
                * Create environmental changes
                * Trigger decision points
                * Force situation resolution

        14. Dynamic Event Resolution:
            - After maximum 2-3 turns of any waiting action:
                * MUST resolve the waiting situation
                * Provide clear narrative progression
                * Introduce new challenges or opportunities
            - Never allow the same "waiting" action to repeat more than twice without major story development

        15. Context-Aware Response Rules:
            Current Situation: {context.get('currentTurn', {}).get('action', '')}
            Previous Actions: {[turn.get('action', '') for turn in context.get('turns', [])[-3:] if turn.get('action')]}
            Time Elapsed: {context.get('currentDateTime')}
            
            Based on these:
            - If same action repeated: MUST progress story significantly
            - If waiting for NPC: MUST resolve within 2-3 turns
            - If situation stagnant: MUST introduce new elements
            - If player stuck: MUST provide clear alternative options
        16. Always check if the hasgameended is true OR Should be set to true according to your rules. (Reminder: hasgameended is true if any stat is 0 or a critical event (rescue, death, all goals / main goal completed) occurs OR if 0 remaining turns. )
        CRITICAL DATE, TIME AND METRIC SYSTEM FORMATTING: IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN FAHRENHEIT OR MILES, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. CONVERSELY, IF YOU CONTEXT INFO CONATINS ANY WEATHER DATA FORMATTED IN CELSIUS OR KILOMETERS, USE ONLY THOSE METRICS IN ALL YOUR RESPONSES. INLCUDING WALKED DISTANCES, DISTANCES BETWEEN POINTS OF INTEREST, ETC.
        
        ---------------------------
        RESPOND ACCORDINGLY:
        ---------------------------
        Based on whether the player's input is a QUESTION or an ACTION and considering the overall progress in the adventure so far, provide your response in the JSON format described above. Extreme or unrealistic inputs must be clarified or severely penalized, and your narration should reflect the overall trajectory (improving vs. deteriorating) based on past decisions.

        ---------------------------
        CUSTOM RULES & PREFERENCES:
        ---------------------------
        {context.get('customRules', '')}

        Important: While maintaining the required JSON structure, incorporate these custom rules into:
        1. Narrative style and detail level
        2. Stat tracking and mechanics
        3. Environmental descriptions
        4. Challenge difficulty
        5. Any specified custom mechanics

        The response format must remain unchanged, but the content should reflect these preferences.
        """

        # Add debug logging to print the full prompt
        print("=== GAME MASTER PROMPT START ===", file=sys.stderr)
        print(structured_prompt, file=sys.stderr)
        print("=== GAME MASTER PROMPT END ===", file=sys.stderr)
        print("\n=== ENVIRONMENTAL CONTEXT ===", file=sys.stderr)
        print(formatted_env_context, file=sys.stderr)
        print("=== END ENVIRONMENTAL CONTEXT ===\n", file=sys.stderr)

        # Generate content using the AI model with our fully constructed prompt
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=structured_prompt
        )
        
        # Extract JSON content from the AI response text.
        json_content = extract_json_from_text(response.text)
        if not json_content:
            # Raise specific error that bypasses fallback
            raise Exception("Failed to generate valid game state")

        # For HARD difficulty, remove the 'options' array from the JSON response.
        if difficulty == 'hard' and 'options' in json_content:
            del json_content['options']

        # Standardize the datetime format in the JSON response.
        if 'datetime' in json_content:
            try:
                test_date = datetime.fromisoformat(json_content['datetime'].replace('Z', '+00:00'))
                json_content['datetime'] = test_date.isoformat().replace('+00:00', 'Z')
            except (ValueError, AttributeError):
                json_content['datetime'] = parsed_datetime.isoformat().replace('+00:00', 'Z')

        return json.dumps({
            "success": True,
            "text": json_content
        })

    except Exception as e:
        # Check if it's the specific JSON extraction error
        if "Failed to generate valid game state" in str(e):
            print(f"Game master JSON format error: {str(e)}", file=sys.stderr)
            # Return failure JSON directly
            return json.dumps({"success": False, "error": str(e)})
        else:
            print(f"Game master error: {str(e)}", file=sys.stderr)
            print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
            print(f"Context received: {context}", file=sys.stderr)
             # Re-raise other exceptions for the decorator
            raise e

@with_model_fallback(primary_model=FLASH_MODEL)
def game_summary(context, options=None):
    """Generate game summary using Gemini 2.0"""
    try:
        # Make sure context is properly parsed as JSON if it's a string
        if isinstance(context, str):
            try:
                context = json.loads(context)
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}", file=sys.stderr)
                print(f"Received context: {context}", file=sys.stderr)
                raise Exception("Invalid JSON format in context")

        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        
        structured_prompt = f"""
        You are a game master summarizing an adventure. Create a JSON summary of this game with the following structure:
        
        GAME DETAILS:
        Title: {context.get('gameName', 'Unknown Adventure')}
        Difficulty: {context.get('difficulty', 'normal')}
        Scenario: {context.get('scenarioDescription', '')}
        Location: {context.get('location', {}).get('name', 'Unknown')}
        Weather: {context.get('weather', 'Unknown')}

        COMPLETE TURN HISTORY:
        {'\n'.join(f"""Turn {turn.get('turnNumber', i+1)}:
            Time: {turn.get('datetime', 'Unknown')}
            Player Action: {turn.get('action', 'None')}
            Location: {turn.get('location', 'Unknown')}
            Weather: {turn.get('weather', 'Unknown')}
            Stats:
              - Health: {turn.get('stats', {}).get('health', 100)}
              - Stamina: {turn.get('stats', {}).get('stamina', 100)}
              - Hunger: {turn.get('stats', {}).get('hunger', 100)}
              - Thirst: {turn.get('stats', {}).get('thirst', 100)}
            Inventory: {', '.join(turn.get('backpackInventory', []))}
            AI Narration: {turn.get('aiNarration', '')}
            Chosen Option: {turn.get('chosenOption', 'None')}
            """ for i, turn in enumerate(context.get('turns', [])))}

        GOALS:
        Main Goal: {context.get('goals', {}).get('main', '')}
        Active Subgoals: {', '.join(context.get('goals', {}).get('subgoals', []))}
        Completed Subgoals: {', '.join(context.get('goals', {}).get('completedSubgoals', []))}

        FINAL STATUS:
        Total Distance: {context.get('totalDistance', 0)}km
        Turns Played: {len(context.get('turns', []))}
        End Reason: {context.get('gameEndReason', 'Unknown')}

        Return EXACTLY this JSON structure:
        {{
          "title": "Adventure Title",
          "summary": "Main summary text (up to 3 paragraphs, shorter if short adventure, more detailed if long adventure. analytical but with charme but also honest. try to reference the story chronologically)",
          "stats": {{
            "finalHealth": {context.get('stats', {}).get('health', 0)},
            "finalStamina": {context.get('stats', {}).get('stamina', 0)},
            "finalHunger": {context.get('stats', {}).get('hunger', 0)},
            "finalThirst": {context.get('stats', {}).get('thirst', 0)},
            "totalDistance": {context.get('totalDistance', 0)},
            "turnsPlayed": {len(context.get('turns', []))}
          }},
          "positives": ["List of things the player did well"],
          "negatives": ["List of things that led to failure"],
          "endReason": "{context.get('gameEndReason', 'Unknown')}"
        }}

        Write the response in {language} language.
        Focus on key decisions and their impact on the story.
        Keep a serious tone appropriate for survival scenarios.
        Include specific details about weather and location challenges.
        Return ONLY the JSON structure, no additional text.
        """

        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded "gemini-2.0-flash-exp"
            contents=structured_prompt
        )
        
        # Extract JSON from the response
        json_content = extract_json_from_text(response.text)
        if not json_content:
            # Raise specific error that bypasses fallback
            raise Exception("Failed to generate valid JSON summary")

        return json.dumps({
            "success": True,
            "summary": json_content
        })
        
    except Exception as e:
        # Check if it's the specific JSON extraction error
        if "Failed to generate valid JSON summary" in str(e):
             print(f"Game summary JSON format error: {str(e)}", file=sys.stderr)
             # Return failure JSON directly
             return json.dumps({"success": False, "error": str(e)})
        else:
            print(f"Game summary error: {str(e)}", file=sys.stderr)
            print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
            print(f"Context received: {context}", file=sys.stderr)
            # Re-raise other exceptions for the decorator
            raise e

@with_model_fallback(primary_model=FLASH_THINKING_MODEL)
def generate_quiz(prompt, options=None):
    """Generate quiz questions using Gemini 2.0"""
    try:
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        
        # Check for cancellation signal via stdin
        if sys.stdin.isatty():  # Only if running in terminal mode
            import select
            if select.select([sys.stdin], [], [], 0)[0]:  # Check if input available
                if sys.stdin.readline().strip() == 'CANCEL':
                    raise Exception("Quiz generation cancelled by user")

        location_analysis = options.get('locationAnalysis', '')
        
        print(f"=== QUIZ GENERATION START ===", file=sys.stderr)
        print(f"Language: {language}", file=sys.stderr)
        print(f"Model: {MODEL_ID}", file=sys.stderr)
        print(f"Location analysis length: {len(location_analysis)}", file=sys.stderr)
        
        structured_prompt = f"""
        Du bist ein Quizmaster für ein Survival- und Naturquiz, das sich auf meinen aktuellen Standort und die umgebenden Bedingungen bezieht. Hier sind die Regeln und Anforderungen. DEINE RESPONSE SOLLTE EINZIG UND ALLEIN DIE EXAKT VORGEGEBENE JSON STRUKTUR SEIN!:

Fragenstruktur:

10 Fragen mit steigendem Schwierigkeitsgrad - easy | medium | hard | expert
Die Fragen können Natur, Flora, Fauna, Umgebung, POIs, Historie und Survival-Taktiken umfassen.
Beziehe dich auf meine Standortdaten, Umweltbedingungen und historische/natürliche Merkmale. 
Nutze lokale Gegebenheiten (z. B. Flüsse, Berge, Pflanzen, Tiere) und entwickle praktische Survival-Szenarien, oder Nagurbezogene Fragen. beziehe dich nicht auf die anzahl von sichtungen.
Antwortmöglichkeiten:

Jede Frage hat 4 Antwortmöglichkeiten.
Die Antworten sollen fundiert und glaubwürdig sein. aber nicht zu leicht.
Themenvielfalt (nur inspiration!):

Ortsbezogene Fragen (z. B. welche Wasserquelle am nächsten liegt).
Survival-Fragen (z. B. welche Pflanze essbar ist oder für Shelter genutzt werden kann).
Historische, ökologische oder geografische Fragen (z. B. Bedeutung eines bestimmten Berges oder Flusses).
Fragen, die auf lokaler Flora und Fauna basieren, aber keine direkten Sichtungsdaten erfordern.
Antworten und Erklärungen:

Gib nach jeder Frage die richtige Antwort an.
Erkläre, warum die Antwort korrekt ist, und füge praktische Hinweise oder zusätzliche Informationen hinzu.
Ton und Stil:

Sei motivierend und freundlich.
Mache das Quiz interaktiv, spannend und lehrreich.


LOCATION ANALYSIS:
{location_analysis}

Nutze meine Standortdaten kreativ, um über das Offensichtliche hinauszugehen.
Schaffe einen Mix aus realitätsnahen und kniffligen Fragen.: 
        CRITICAL REQUIREMENTS:
        category: fauna, flora or survival
        questions starting with easy and ending with expert
        IMPORTANT! IF {language} IS NOT GERMAN OR ENGLISH, RETURN THE QUESTIONS AND ANSWERS FOR BOTH EN AND DE IN THE {language} LANGUAGE (it = Italian, es = Spanish, fr = French, pt = Portuguese, ja = Japanese, etc.).
        1. Return EXACTLY this JSON structure:
        {{
            "quiz": [
                {{
                    "category": "fauna",
                    "difficulty": "easy",
                    "question": {{
                        "en": "english question text or {language} if {language} is neither en or de. {language} LANGUAGE (it = Italian, es = Spanish, fr = French, pt = Portuguese, ja = Japanese, etc.).",
                        "de": "german question text or {language} if {language} is neither en or de. {language} LANGUAGE (it = Italian, es = Spanish, fr = French, pt = Portuguese, ja = Japanese, etc.)."
                    }},
                    "answers": {{
                        "en": [
                            "Answer1",
                            "Answer2",
                            "Answer3",
                            "Answer4"
                        ],
                        "de": [
                            "Answer1",
                            "Answer2",
                            "Answer3",
                            "Answer4"
                        ]
                    }},
                    "correct_answer": {{
                        "en": "correct answer",
                        "de": "correct answer"
                    }},
                    "explanation": {{
                        "en": "explanation",
                        "de": "explanation"
                    }},
                    "image": "https://example.com/images/ostrich_eggs.jpg"
                }}
            ]
        }}

        2. Questions should be challenging but fair
        3. All content must be in {language} language (IF {language} IS NOT GERMAN OR ENGLISH, RETURN THE QUESTIONS AND ANSWERS FOR BOTH EN AND DE IN THE {language} LANGUAGE.  {language} LANGUAGE (it = Italian, es = Spanish, fr = French, pt = Portuguese, ja = Japanese, etc.), Keep the exact JSON structure, return nothing else)
        4. Each question must have exactly 4 options
        5. Explanations should be educational and clear
        6. Return EXACTLY the provided JSON structure
        """

        # Use MODEL_ID for the API call
        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded 'gemini-2.0-flash-thinking-exp'
            contents=structured_prompt
        )

        # Get the response text
        final_response = response.text
        
        print(f"Raw response length: {len(final_response)}", file=sys.stderr)
        print(f"Raw response preview: {final_response[:200]}...", file=sys.stderr)

        # Extract JSON from the response
        json_content = extract_json_from_text(final_response)
        
        if not json_content:
            print(f"JSON extraction failed. Full response:", file=sys.stderr)
            print(final_response, file=sys.stderr)
            # Raise specific error that bypasses fallback
            raise Exception("Failed to generate valid quiz data")

        # Validate the quiz structure
        if not isinstance(json_content, dict) or 'quiz' not in json_content:
            print(f"Invalid quiz structure: {json_content}", file=sys.stderr)
            raise Exception("Invalid quiz structure - missing 'quiz' key")
            
        quiz_array = json_content.get('quiz', [])
        if not isinstance(quiz_array, list) or len(quiz_array) == 0:
            print(f"Invalid quiz array: {quiz_array}", file=sys.stderr)
            raise Exception("Invalid quiz structure - 'quiz' is not a valid array")
            
        print(f"Successfully generated {len(quiz_array)} quiz questions", file=sys.stderr)
        print(f"=== QUIZ GENERATION SUCCESS ===", file=sys.stderr)

        return json.dumps({
            "success": True,
            "text": json_content
        })
        
    except Exception as e:
        print(f"=== QUIZ GENERATION ERROR ===", file=sys.stderr)
        print(f"Error type: {type(e).__name__}", file=sys.stderr)
        print(f"Error message: {str(e)}", file=sys.stderr)
        
        # Check if it's the specific JSON extraction error
        if "Failed to generate valid quiz data" in str(e) or "Invalid quiz structure" in str(e):
             print(f"Quiz generation JSON format error: {str(e)}", file=sys.stderr)
             # Return failure JSON directly
             return json.dumps({"success": False, "error": str(e)})
        else:
            print(f"Quiz generation error: {str(e)}", file=sys.stderr)
             # Re-raise other exceptions for the decorator
            raise e

@with_model_fallback(primary_model=FLASH_MODEL)
def check_image_appropriate(prompt, image_path, options=None):
    """Check if an image is appropriate for public sharing using Gemini 2.0"""
    try:
        # Load the image
        if image_path.startswith(('http://', 'https://')):
            response = requests.get(image_path)
            image_data = BytesIO(response.content)
            img = Image.open(image_data).convert('RGB')
        else:
            img = Image.open(image_path).convert('RGB')

        structured_prompt = """
        Analyze this image and determine if it's appropriate for public sharing on a nature and outdoor activities platform.
        Consider the following criteria:
        - No explicit adult content
        - No graphic violence or gore
        - No hate symbols or offensive content
        - No private/sensitive information
        - Must be related to nature, outdoor activities, or relevant subjects. It may be taken indoors, may only slightly depict an animal, plant, POI etc. Surivival / bushcraft is fine as well. its mainly to determine whether or not the content is inappropriate and might harm others
        - Inform user that he can still save the image privately
        Return a JSON response with this exact structure:
        {
            "isAppropriate": true/false,
            "reason": "Brief explanation of why the image is appropriate or inappropriate"
        }
        """

        # Add debug logging
        print("=== IMAGE APPROPRIATENESS CHECK START ===", file=sys.stderr)
        print(f"Checking image: {image_path}", file=sys.stderr)

        response = client.models.generate_content(
            model=MODEL_ID, # Changed from hardcoded "gemini-2.0-flash-exp"
            contents=[structured_prompt, img]
        )
        
        # Extract JSON from the response
        json_content = extract_json_from_text(response.text)
        if not json_content:
            # Raise specific error that bypasses fallback
            raise Exception("Failed to get valid response format in check_image_appropriate")
        
        # Log the result
        print(f"Appropriateness check result: {json_content}", file=sys.stderr)
        print("=== IMAGE APPROPRIATENESS CHECK END ===\n", file=sys.stderr)
        
        return json.dumps({
            "success": True,
            "isAppropriate": json_content.get("isAppropriate", False),
            "reason": json_content.get("reason", "Unknown reason")
        })
    except Exception as e:
        # Check if it's the specific JSON extraction error
        if "Failed to get valid response format in check_image_appropriate" in str(e):
            print(f"Image check JSON format error: {str(e)}", file=sys.stderr)
             # Return failure JSON directly
            return json.dumps({"success": False, "error": str(e)})
        else:
            print(f"Error in check_image_appropriate: {str(e)}", file=sys.stderr)
            # Re-raise other exceptions for the decorator
            raise e

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    prompt = sys.argv[2] if len(sys.argv) > 2 else "Hello, Gemini!"
    # Handle image_url: Set to None if it's 'NONE' or not provided
    image_url_arg = sys.argv[3] if len(sys.argv) > 3 else None
    image_url = None if image_url_arg == 'NONE' else image_url_arg
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
    elif mode == "scenarios":
        response = generate_scenarios(prompt, options)
    elif mode == "game_setup":
        response = game_setup(prompt, options)
    elif mode == "game_master":
        response = game_master(prompt, options)
    elif mode == "game_summary":
        response = game_summary(prompt, options)
    elif mode == "quiz":
        response = generate_quiz(prompt, options)
    elif mode == "check_appropriate":
        response = check_image_appropriate(prompt, image_url, options)
    else:
        response = generate_content(prompt)
    
    # Print the JSON response first
    print(response)
    
    # Then print debug info to stderr instead of stdout
    print(f"Python script received args: mode={mode}, prompt={prompt}, image={image_url}, options={options}", file=sys.stderr) 