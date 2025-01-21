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
            
            # Ensure proper encoding of special characters
            json_str = json_str.encode('utf-8').decode('utf-8')
            
            # Updated regex to preserve basic punctuation
            cleaned = re.sub(r'(?<![\{\[,:\s])"(?![,:\}\]\s]).*?(?<![\{\[,:\s])"(?![,:\}\]\s])', '', json_str)
            # Allow periods, commas, exclamation marks, and question marks in text
            cleaned = re.sub(r'[^\{\}\[\]",:0-9a-zA-Z\s_\-äöüßÄÖÜ\.!?]', '', cleaned)
            cleaned = re.sub(r'\s+', ' ', cleaned)
            
            # Try to parse the cleaned string
            return json.loads(cleaned)
    except Exception as e:
        print(f"JSON extraction failed: {e}", file=sys.stderr)
        print(f"Original text: {text}", file=sys.stderr)
        return None

def json_dumps_utf8(obj):
    """Helper function to ensure proper UTF-8 encoding in JSON responses"""
    return json.dumps(obj, ensure_ascii=False)

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

            special conditions: IF the category you chose is either flora fauna or fungi, then you MUST return the following JSON structure:
            {{
                "response_mime_type": "application/json",
                "data": {{
                    "category": "Flora|Fauna|Fungi",
                    "subcategory": "taxonkey NUMBER (closest matching order)",
                    "name": "{language} name/title (preferably the common name with latin name in paranthesis)",
                    "description": "detailed {language} description"
                }}
            }}

            with taxonkey being the CLOSEST MATCH of the proper ORDER according this list (use the number): Taxonomy:
Flora (Plants):
Fagales: Fagaceae (e.g., beech, oak) taxonKey: 1354
Pinales: Pinaceae (e.g., pine, spruce) taxonKey: 640
Sapindales: Sapindaceae (e.g., maple, horse chestnut) taxonKey: 933
Myrtales: Myrtaceae (e.g., eucalyptus, myrtle) taxonKey: 690
Malpighiales: Salicaceae (e.g., willow, poplar) taxonKey: 1414
Araucariales: Araucariaceae (e.g., monkey puzzle tree) taxonKey: 3924
Laurales: Lauraceae (e.g., laurel, avocado) taxonKey: 407
Asterales: Asteraceae (e.g., daisies, sunflowers) taxonKey: 414
Liliales: Liliaceae (e.g., lilies, tulips) taxonKey: 1172
Rosales: Rosaceae (e.g., roses, apples) taxonKey: 691
Poales: Poaceae (e.g., grasses, sedges) taxonKey: 1369
Caryophyllales: Cactaceae (e.g., cacti, succulents) taxonKey: 422
Fabales: Fabaceae (e.g., legume trees) taxonKey: 1370
Ericales: Ericaceae (e.g., ericas) taxonKey: 1353
Polypodiales: Polypodiaceae (e.g., true ferns) taxonKey: 392
Bryopsida: Bryophyta (e.g., mosses) taxonKey: 327
Marchantiopsida: Marchantiaceae (e.g., liverworts) taxonKey: 125
Aquatic and Marine Plants:
Alismatales: Alismataceae (e.g., water plants) taxonKey: 551
Ulvophyceae: Ulvaceae (e.g., green algae) taxonKey: 195
Phaeophyceae: Phaeophyta (e.g., brown algae) taxonKey: 7073593
Charophyceae: Characeae (e.g., stoneworts) taxonKey: 328
Palms and Cycads:
Arecales: Arecaceae (e.g., palms) taxonKey: 552
Cycadophyta: Cycadaceae (e.g., cycads) taxonKey: 834
Fauna (Animals):
Mammals:
Artiodactyla: Bovidae (e.g., deer, antelope) taxonKey: 731
Carnivora: Felidae (e.g., lions, tigers) taxonKey: 732
Lagomorpha: Leporidae (e.g., rabbits, hares) taxonKey: 785
Rodentia: Muridae (e.g., rats, mice) taxonKey: 1459
Chiroptera: Vespertilionidae (e.g., bats) taxonKey: 734
Talpidae: Talpidae (e.g., moles, shrews) taxonKey: 9469
Cetacea: Delphinidae (e.g., dolphins, whales) taxonKey: 733
Didelphimorphia: Didelphidae (e.g., opossums) taxonKey: 1452
Primates: Hominidae (e.g., chimpanzees, humans) taxonKey: 798
Monotremata: Ornithorhynchidae (e.g., platypus) taxonKey: 791
Perissodactyla: Equidae (e.g., horses, rhinos) taxonKey: 795
Birds:
Passeriformes: Passeridae (e.g., sparrows) taxonKey: 729
Accipitriformes: Accipitridae (e.g., hawks, eagles) taxonKey: 7191147
Anseriformes: Anatidae (e.g., ducks, geese) taxonKey: 1108
Galliformes: Phasianidae (e.g., chickens, pheasants) taxonKey: 723
Falconiformes: Falconidae (e.g., falcons) taxonKey: 5240
Procellariiformes: Procellariidae (e.g., petrels, albatrosses) taxonKey: 7192755
Strigiformes: Strigidae (e.g., owls) taxonKey: 1450
Coraciiformes: Alcedinidae (e.g., kingfishers) taxonKey: 1447
Charadriiformes: Laridae (e.g., gulls, terns) taxonKey: 7192402
Psittaciformes: Psittacidae (e.g., parrots) taxonKey: 1445
Ciconiiformes: Ciconiidae (e.g., storks) taxonKey: 839
Reptiles:
Squamata: Colubridae (e.g., snakes, lizards) taxonKey: 11592253
Testudines: Cheloniidae (e.g., turtles) taxonKey: 11418114
Crocodylia: Crocodylidae (e.g., crocodiles, alligators) taxonKey: 11493978
Rhynchocephalia: Sphenodontidae (e.g., tuatara) taxonKey: 703
Amphibians:
Anura: Ranidae (e.g., frogs, toads) taxonKey: 952
Caudata: Salamandridae (e.g., salamanders) taxonKey: 953
Fish:
Perciformes: Percidae (e.g., perches) taxonKey: 587
Cypriniformes: Cyprinidae (e.g., carps, minnows) taxonKey: 1153
Siluriformes: Siluridae (e.g., catfish) taxonKey: 708
Salmoniformes: Salmonidae (e.g., salmon, trout) taxonKey: 1313
Esociformes: Esocidae (e.g., pike) taxonKey: 548
Elasmobranchii: Carcharhinidae (e.g., sharks) taxonKey: 121
Anguilliformes: Anguillidae (e.g., eels) taxonKey: 495
Gadiformes: Gadidae (e.g., cod, haddock) taxonKey: 549
Invertebrates:
Araneae: Araneidae (e.g., spiders) taxonKey: 1496
Decapoda: Portunidae (e.g., crabs, crayfish) taxonKey: 637
Lepidoptera: Nymphalidae (e.g., butterflies, moths) taxonKey: 797
Hymenoptera: Apidae (e.g., bees, ants) taxonKey: 1457
Coleoptera: Carabidae (e.g., beetles) taxonKey: 1470
Oligochaeta: Lumbricidae (e.g., earthworms) taxonKey: 8166676
Scyphozoa: Cyaneidae (e.g., jellyfish) taxonKey: 352
Orthoptera: Acrididae (e.g., grasshoppers) taxonKey: 1458
Isoptera: Termitidae (e.g., termites) taxonKey: 999
Cephalopoda: Octopodidae (e.g., octopus, squid) taxonKey: 136
Cnidaria: Cnidaria (e.g., corals) taxonKey: 43
Bivalvia: Veneridae (e.g., clams, mussels) taxonKey: 137
Annelida: Polychaeta (e.g., segmented worms) taxonKey: 42
Echinodermata: Asteriidae (e.g., sea stars, urchins) taxonKey: 50
Fungi:
Mushrooms and Fungi:
Agaricales: Agaricaceae (e.g., gilled mushrooms) taxonKey: 1499
Polyporales: Polyporaceae (e.g., bracket fungi) taxonKey: 1145
Lecanorales: Parmeliaceae (e.g., lichens) taxonKey: 1048
Lichenized Fungi:
Peltigerales: Peltigeraceae (e.g., leafy lichens) taxonKey: 1055
Pathogenic Fungi:
Ustilaginales: Ustilaginaceae (e.g., smut fungi) taxonKey: 1121
Pucciniales: Pucciniaceae (e.g., rust fungi) taxonKey: 1126
Sac Fungi:
Pezizales: Morchellaceae (e.g., morels, truffles) taxonKey: 1057
Hypocreales: Hypocreaceae (e.g., molds) taxonKey: 1290
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

        CRITICAL: Respond in {language} language WITHOUT including the language code. Never start your response with language codes like 'de:', 'en:', etc. Also do not give any introduction, reply only with the answer. When referring times or units of measurement, use the language of the user (miles in english, km in german, etc).
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
                    "title": "Brief title",
                    "description": "One-line description",
                    "icon": "Select one: tree-outline, triangle-outline, water-outline, sunny-outline, flash-outline, compass-outline"
                }},
                // 3 more scenarios following the same structure
            ]
        }}

        REQUIREMENTS:
        1. Each scenario must be realistic for the location
        2. Include environmental challenges specific to the area
        3. Consider seasonal weather patterns
        4. Incorporate local terrain features
        5. Response must be in {language} language
        6. Icons should match the scenario theme
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        # Extract JSON from response
        json_content = extract_json_from_text(response.text)
        
        if not json_content:
            raise Exception("Failed to generate valid scenario data")

        return json.dumps({
            "success": True,
            "text": json_content
        })
        
    except Exception as e:
        print(f"Scenario generation error: {str(e)}")
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def game_setup(settings_data, options=None):
    """Generate game setup using Gemini 2.0"""
    try:
        settings_dict = json.loads(settings_data) if isinstance(settings_data, str) else settings_data
        settings_data = settings_dict.get('settings', {})
        language = settings_dict.get('language', 'en')
        
        print(f"Game setup generating content in language: {language}", file=sys.stderr)
        
        # Get difficulty and scenario details
        difficulty = settings_data.get('difficulty', {}).get('id', 'normal')
        scenario_type = settings_data.get('scenario', {}).get('type', 'predefined')
        scenario_desc = (settings_data.get('scenario', {}).get('description') if scenario_type == 'custom' 
                        else settings_data.get('scenario', {}).get('details', {}).get('description', ''))

        # Define difficulty requirements as a separate string
        difficulty_requirements = {
            'easy': """
                - health/hunger/thirst/stamina: Start at 100
                - injuries: Empty array
                - backpack: 5-7 useful items
                - options: Provide 3-4 clear, helpful options
                - introduction: Friendly, informative tone
            """,
            'normal': """
                - health/hunger/thirst/stamina: Start at 90-100
                - injuries: Empty array
                - backpack: 3-4 basic items
                - options: Provide 2-3 realistic options
                - introduction: Neutral, realistic tone
            """,
            'hard': """
                - health/hunger/thirst/stamina: Start at 70-90
                - injuries: Include 1 minor injury
                - backpack: 1-2 basic items
                - options: NO options array (player must type their own actions)
                - introduction: Challenging, tense tone
            """
        }.get(difficulty, difficulty_requirements['normal'])  # Default to normal if invalid difficulty
        
        formatted_settings = f"""
        Generate a survival scenario based on these settings and requirements:
        
        GAME SETTINGS:
        Date and Time: {settings_data.get('datetime', '')}
        Location: {settings_data.get('location', {}).get('name', 'Unknown')}
        Coordinates: Lat {settings_data.get('location', {}).get('coordinates', {}).get('latitude', 0)}, 
                    Long {settings_data.get('location', {}).get('coordinates', {}).get('longitude', 0)}
        Elevation: {settings_data.get('location', {}).get('elevation', 0)}m
        Weather: {settings_data.get('weather', '')}
        Difficulty: {difficulty}
        Scenario: {scenario_desc}
        
        Return EXACTLY this JSON structure:
        {{
            "title": "Scenario Title",
            "introduction": "Brief scenario setup (2-3 sentences)",
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
            "options": [<options>],
            "backpack": [<items>]
        }}
        
        DIFFICULTY REQUIREMENTS:
        For difficulty = '{difficulty}':
        {difficulty_requirements}

        CRITICAL REQUIREMENTS:
        1. Response must be in {language} language
        2. Adapt narrative tone to difficulty level
        3. Ensure backpack items are relevant to scenario and location
        4. Goals should reflect scenario type and difficulty
        5. All text fields must use proper grammar and punctuation
        6. Weather and location should significantly influence the scenario
        """

        print(f"game_setup formatted prompt: {formatted_settings}", file=sys.stderr)
        
        # Generate response using the formatted settings
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=formatted_settings
        )
        
        print(f"game_setup raw response: {response.text}", file=sys.stderr)
        
        # Extract JSON from response
        json_content = extract_json_from_text(response.text)
        print(f"game_setup extracted JSON: {json_content}", file=sys.stderr)
        
        if not json_content:
            raise Exception("Failed to generate valid game setup data")

        return json.dumps({
            "success": True,
            "text": json_content
        })
        
    except Exception as e:
        print(f"Game setup generation error: {str(e)}", file=sys.stderr)
        print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
        return json.dumps({
            "success": False,
            "error": str(e)
        })

def game_master(context, options=None):
    """Process game turns using Gemini 2.0"""
    try:
        context = json.loads(context) if isinstance(context, str) else context
        options = json.loads(options) if isinstance(options, str) else options or {}
        language = options.get('language', 'en')
        
        latest_turn = context.get('turns', [])[-1] if context.get('turns') else {}
        current_turn = context.get('currentTurn', {})
        difficulty = context.get('difficulty', 'normal')
        total_distance = latest_turn.get('totalDistance', 0)  # Track total distance walked
        
        # Ensure we're using the correct datetime from the latest turn
        current_datetime = latest_turn.get('datetime') or context.get('currentDateTime')
        
        # Parse the datetime string to ensure proper format
        try:
            parsed_datetime = datetime.fromisoformat(current_datetime.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            parsed_datetime = datetime.utcnow()
        
        all_turns = context.get('turns', [])

        structured_prompt = f"""
        You are an expert game master and survival expert for this adventure. First, analyze if the player's input is a QUESTION or an ACTION.

        PLAYER INPUT:
        {current_turn.get('action', '')}

        GAME CONTEXT:
        Title: {context.get('gameName', 'Unknown')}
        Difficulty: {context.get('difficulty', 'normal')}
        Scenario: {context.get('scenarioDescription', '')}
        Total Distance Traveled: {total_distance}km
        
        LOCATION DETAILS:
        Current Position: {latest_turn.get('location', 'Unknown')}
        GPS: Lat {context.get('location', {}).get('coordinates', {}).get('latitude', 'Unknown')}, 
             Long {context.get('location', {}).get('coordinates', {}).get('longitude', 'Unknown')}
        Elevation: {context.get('location', {}).get('elevation', 'Unknown')}m
        Local Time: {current_datetime}
        Weather: {latest_turn.get('weather', 'Unknown')}

        CURRENT STATUS:
        Health: {latest_turn.get('stats', {}).get('health', 100)}
        Stamina: {latest_turn.get('stats', {}).get('stamina', 100)}
        Hunger: {latest_turn.get('stats', {}).get('hunger', 100)}
        Thirst: {latest_turn.get('stats', {}).get('thirst', 100)}
        Inventory: {', '.join(latest_turn.get('backpackInventory', []))}
        Turns Remaining: {latest_turn.get('remainingTurns', 20)}

        COMPLETE TURN HISTORY:
        {' '.join([f"Turn {i+1}: {turn.get('chosenOption', 'None')} - {turn.get('aiNarration', '')}" 
                  for i, turn in enumerate(all_turns) if turn.get('chosenOption')])}

        CRITICAL REQUIREMENTS:
        1. Response MUST be in {language} language only
        
        2. NEVER allow players to decide outcomes of their actions:
           - Players can ONLY specify WHAT they want to do
           - YOU determine HOW it happens and the consequences
           - Players cannot declare success or specify results
           - Example NOT allowed: "I successfully build a perfect shelter"
           - Example allowed: "I try to build a shelter using branches and leaves"

        3. For difficult/intense/dangerous situations:
           - Require more specific action descriptions from players
           - Ask for clarification if the action is too vague
           - Example too vague: "I fight the bear"
           - Example specific: "I slowly back away while maintaining eye contact with the bear"

        4. When player input needs clarification:
           - Return as a question (isQuestion: true)
           - This will NOT consume a turn
           - Ask specific questions about HOW they plan to perform the action
           - Provide relevant options when appropriate
           - Example: "How exactly do you plan to cross the river? Consider:
             * Searching for a shallow crossing point
             * Building a simple raft
             * Finding a fallen tree bridge"

        5. First determine if the input is a QUESTION or ACTION:
           - Questions typically ask about surroundings, status, or seek information
           - Actions are attempts to do something that changes the game state
        
        6. If input is a QUESTION:
           - Return this exact JSON structure:
           {{
               "isQuestion": true,
               "answer": "Detailed, immersive response (3-5 sentences) based on observable conditions, time of day, weather, and surroundings. Include relevant survival knowledge when appropriate."
           }}
           - Consider visibility conditions, available light, weather impact
           - Include sensory details (sounds, smells, temperature)
           - Reference relevant survival expertise
           - Keep responses realistic and grounded
        
        7. If input is an ACTION:
           - Process it as a game turn with detailed survival mechanics
           - Calculate precise time requirements for actions:
             * Walking/Hiking: 2-4 km/h depending on terrain
             * Gathering resources: 15-45 minutes
             * Building shelter: 1-3 hours
             * Making fire: 15-60 minutes
             * Hunting/Fishing: 1-4 hours
             * Water collection/purification: 30-60 minutes
           - Update datetime based on realistic action duration
           - Track total distance traveled when moving
           - Adjust hunger/thirst rates based on activity level and time:
             * Light activity: -5 hunger per 4 hours, -7 thirst per 3 hours
             * Moderate activity: -7 hunger per 3 hours, -10 thirst per 2 hours
             * Heavy activity: -10 hunger per 2 hours, -15 thirst per hour
             * Extreme conditions accelerate these rates
           - Track resource degradation and consumption:
             * Tools wear down with use
             * Limited-use items (lighters, matches) deplete realistically
             * Food/water supplies diminish with consumption
           - Consider weather changes over time:
             * Update weather after significant time passage (2+ hours)
             * Account for day/night cycle weather patterns
             * Include sudden weather changes when appropriate
           - Return this exact JSON structure:
           {{
               "isQuestion": false,
               "health": NUMBER between 0-100,
               "stamina": NUMBER between 0-100,
               "hunger": NUMBER between 0-100,
               "thirst": NUMBER between 0-100,
               "injuries": ["detailed_injury1", "detailed_injury2"],
               "turnsRemaining": NUMBER between 0-20,
               "weather": "Detailed weather description including changes over time",
               "lastAction": "Rich, atmospheric narration (3-5 sentences) describing:
                            - What the player did
                            - How long it took
                            - Environmental challenges
                            - Use of tools/inventory
                            - Impact on survival situation",
               "location": {{
                   "name": "Detailed location description",
                   "coordinates": {{
                       "latitude": DECIMAL_NUMBER,
                       "longitude": DECIMAL_NUMBER
                   }},
                   "elevation": NUMBER
               }},
               "datetime": "Updated datetime reflecting realistic action duration",
               "totalDistance": NUMBER (total km traveled, accumulated from previous distance),
               "goals": {{
                   "main": "Main objective text",
                   "subgoals": ["Subgoal 1", "Subgoal 2", "Subgoal 3"],
                   "completedSubgoals": ["Completed subgoal 1"]
               }},
               "hasGameEnded": true/false,
               "gameEndReason": "Detailed explanation if game ended, or null",
               "options": [
                   {{
                       "id": "option1",
                       "text": "Detailed action description with survival context",
                       "consequences": {{
                           "health": NUMBER between -100 and 0,
                           "description": "Realistic outcome based on survival expertise"
                       }}
                   }},
                   // 2-3 more options (ONLY for normal/easy difficulty)
               ],
               "backpack": ["Updated inventory reflecting used/depleted items"]
           }}

        8. For ACTIONS, apply realistic survival mechanics:
           - Calculate precise energy expenditure
           - Track tool degradation and resource consumption realistically:
             * Tools break or wear out with repeated use
             * Limited-use items deplete permanently
             * No infinite resources or "magic refills"
           - Consider terrain difficulty and elevation changes
           - Factor in weather effects on activities
           - Apply realistic injury risks
           - Account for day/night cycle impact
           - End game with detailed explanation if:
             * Health reaches 0
             * Critical injury occurs
             * Extreme weather event
             * Lost/disoriented
             * Resource depletion
             * Turns exhausted

        9. Maintain Realism and Progression:
           - Actions must follow real-world physics and survival logic
           - No "lucky" discoveries or convenient solutions
           - Weather and environmental conditions change naturally
           - Injuries persist and require proper treatment
           - Resources deplete permanently
           - Time passes realistically
           - Failed attempts should have consequences:
             * Tools/items can break or be lost
             * Energy/resources are wasted
             * Situation may worsen
           - Success/failure should reflect player strategy:
             * Better preparation increases success chance
             * Poor choices lead to complications
             * Repeated failures without new approach lead to worse outcomes

        10. Difficulty-Specific Rules:
            For HARD difficulty:
            - NO options array in response
            - NO utilities/tools in starting inventory
            - Higher resource consumption rates
            - More frequent weather changes
            - Stricter injury/health penalties
            - Require more detailed player actions

        Current Goals:
        Main Goal: {context.get('goals', {}).get('main', '')}
        Subgoals: {', '.join(context.get('goals', {}).get('subgoals', []))}
        Completed Subgoals: {', '.join(context.get('goals', {}).get('completedSubgoals', []))}

        CRITICAL TIME REQUIREMENTS:
        - Calculate realistic time passage based on the action
        - Walking/Hiking: 2-4 km/h depending on terrain
        - Resource gathering: 15-45 minutes
        - Building shelter: 1-3 hours
        - Making fire: 15-60 minutes
        - Hunting/Fishing: 1-4 hours
        - Water collection: 30-60 minutes
        - Return the new time in the response considering:
          * Distance to destinations
          * Terrain difficulty
          * Weather conditions
          * Player's current stamina
          * Time needed for the specific action
        """

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=structured_prompt
        )
        
        json_content = extract_json_from_text(response.text)
        
        if not json_content:
            raise Exception("Failed to generate valid game state")

        # Ensure no options array for hard difficulty
        if difficulty == 'hard' and 'options' in json_content:
            del json_content['options']

        # The AI will have calculated the new time based on the action
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
        print(f"Game master error: {str(e)}", file=sys.stderr)
        print(f"Full error details: {e.__class__.__name__}: {str(e)}", file=sys.stderr)
        print(f"Context received: {context}", file=sys.stderr)
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
    elif mode == "scenarios":
        response = generate_scenarios(prompt, options)
    elif mode == "game_setup":
        response = game_setup(prompt, options)
    elif mode == "game_master":
        response = game_master(prompt, options)
    else:
        response = generate_content(prompt)
    
    # Print the JSON response first
    print(response)
    
    # Then print debug info to stderr instead of stdout
    print(f"Python script received args: mode={mode}, prompt={prompt}, image={image_url}, options={options}", file=sys.stderr) 