const { spawn } = require('child_process');
const path = require('path');
const rateLimiter = require('./rateLimiter');

async function generateContent(prompt, context = '') {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const fullPrompt = context ? `Context: ${context}\n\nPrompt: ${prompt}` : prompt;
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const pythonProcess = spawn('python', [pythonScript, 'text', fullPrompt]);
            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(errorString || 'Process failed'));
                    return;
                }

                try {
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate summary'));
                        return;
                    }
                    
                    // Pass through the entire response object
                    resolve(response);  // Changed from response.text
                } catch (error) {
                    console.error('Parse error:', error);
                    reject(new Error('Failed to parse response'));
                }
            });
       
        });
    });
}

async function generateContentStream(prompt, context = '') {
    // For now, we'll use non-streaming version as base implementation
    const response = await generateContent(prompt, context);
    return {
        stream: [{
            text: () => response
        }]
    };
}

async function searchAndGenerate(prompt) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            const pythonProcess = spawn('python', [pythonScript, 'search', prompt]);
            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(JSON.stringify(response));
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyzeImage(prompt, imageUrl, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const optionsStr = typeof options === 'string' ? options : JSON.stringify(options);
            console.log('aiService sending options:', optionsStr);
            
            const pythonProcess = spawn('python', [
                pythonScript, 
                'vision', 
                prompt, 
                imageUrl,
                optionsStr
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (!response.success) {
                        reject(new Error(response.error || 'Analysis failed'));
                        return;
                    }

                    // Parse the nested JSON string
                    const analysisData = JSON.parse(response.text);
                    if (!analysisData.data) {
                        reject(new Error('Invalid analysis data structure'));
                        return;
                    }

                    resolve(analysisData);
                } catch (error) {
                    console.error('Parse error:', error);
                    console.error('Raw data:', dataString);
                    reject(new Error('Failed to parse analysis response'));
                }
            });
        });
    });
}

async function flashChat(prompt, language = 'en', context = '', imageUri = null) {
    console.log('aiService - Flash Chat:', {
        prompt,
        language,
        contextLength: context?.length || 0,
        contextPreview: context?.substring(0, 200) + '...',
        hasImage: !!imageUri
    });

    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            const options = JSON.stringify({ language, context });
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'flash',
                prompt,
                imageUri, // Pass the image URI
                options
            ]);
            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    console.error('Parse error:', error, 'Raw data:', dataString);
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyzeBiome(location, coordinates, language = 'en') {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            const options = JSON.stringify({
                language,
                type: 'biome_analysis',
                coordinates
            });
            
            const prompt = `Location: ${location}\nCoordinates: ${coordinates.latitude}, ${coordinates.longitude}`;
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'biome',
                prompt,
                'null',  // no image
                options
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyze_weather(prompt, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('aiService sending weather analysis request:', {
                prompt: prompt.substring(0, 100) + '...',
                options
            });
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'weather',
                prompt,
                'null',  // Add this placeholder for image parameter
                JSON.stringify(options)  // Pass options as the last parameter
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    // Find the last JSON object in the output
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/g);
                    if (jsonMatch) {
                        const lastJson = jsonMatch[jsonMatch.length - 1];
                        const response = JSON.parse(lastJson);
                        if (response.success) {
                            resolve(response.text);
                        } else {
                            reject(new Error(response.error));
                        }
                    } else {
                        reject(new Error('No valid JSON found in Python response'));
                    }
                } catch (error) {
                    console.error('Failed to parse Python response:', dataString);
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function analyzeInfo(prompt, options = {}) {
    console.log('aiService.analyzeInfo called with:', {
        prompt,
        options
    });
    
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const optionsStr = JSON.stringify(options);
            console.log('aiService sending options to Python:', optionsStr);
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'info',
                prompt,
                'null',  // no image
                optionsStr
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function generateScenarios(locationInfo, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            const optionsStr = JSON.stringify(options);
            console.log('aiService generating scenarios for location:', locationInfo);
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'scenarios',
                locationInfo,
                'null',  // no image
                optionsStr
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function gameSetup(settings, options = {}) {
    console.log('AI Service gameSetup - Language:', settings.language, 'Options:', options);
    
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            // Clean and prepare the settings object
            const cleanSettings = {
                settings: {
                    datetime: settings.settings.datetime,
                    location: {
                        name: settings.settings.location?.name || 'Unknown',
                        coordinates: {
                            latitude: Number(settings.settings.location?.coordinates?.latitude || 0),
                            longitude: Number(settings.settings.location?.coordinates?.longitude || 0)
                        },
                        elevation: Number(settings.settings.location?.elevation || 0)
                    },
                    weather: settings.settings.weather,
                    difficulty: settings.settings.difficulty,
                    scenario: settings.settings.scenario,
                    environmentalContext: settings.settings.environmentalContext,
                    customRules: settings.settings.customRules
                },
                language: settings.language || options.language || 'en'
            };

            console.log('Sending to Python with language:', cleanSettings.language);
            console.log('aiService sending game setup request:', JSON.stringify(cleanSettings));
            console.log('aiService options:', JSON.stringify(options));
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'game_setup',
                JSON.stringify(cleanSettings),
                'null',  // no image
                JSON.stringify(options)
            ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.log('Python stdout chunk:', chunk);
                dataString += chunk;
            });

            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.log('Python stderr chunk:', chunk);
                errorString += chunk;
            });

            pythonProcess.on('close', (code) => {
                console.log('Python process closed with code:', code);
                console.log('Final stdout:', dataString);
                console.log('Final stderr:', errorString);
                
                if (code !== 0) {
                    console.error('Python process error:', errorString);
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    // Try to find and parse only the JSON part of the response
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        console.error('No JSON found in response. Full response:', dataString);
                        throw new Error('No JSON found in response');
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    console.log('Parsed response:', response);
                    
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate game setup'));
                        return;
                    }
                    resolve(response);
                } catch (error) {
                    console.error('Parse error:', error);
                    console.error('Raw data:', dataString);
                    reject(new Error('Failed to parse Python response'));
                }
            });
        });
    });
}

async function gameMaster(context, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('aiService sending game master request:', JSON.stringify(context));
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'game_master',
                JSON.stringify(context),
                'null',  // no image
                JSON.stringify(options)
            ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.log('Python stdout:', chunk);
                dataString += chunk;
            });

            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.error('Python stderr:', chunk);
                errorString += chunk;
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('Process exited with code', code);
                    reject(new Error(errorString || 'Process failed'));
                    return;
                }

                try {
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        console.error('No JSON found in response:', dataString);
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to process game turn'));
                        return;
                    }
                    
                    resolve(response.text);
                } catch (error) {
                    console.error('Parse error:', error);
                    console.error('Raw data:', dataString);
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

async function gameSummary(context, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('aiService sending game summary request:', JSON.stringify(context));
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'game_summary',
                JSON.stringify(context),
                'null',  // no image
                JSON.stringify(options)
            ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString('utf-8');
            });

            pythonProcess.stderr.on('data', (data) => {
                errorString += data.toString('utf-8');
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(errorString || 'Process failed'));
                    return;
                }

                try {
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate summary'));
                        return;
                    }
                    
                    resolve(response);
                } catch (error) {
                    console.error('Parse error:', error);
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

async function generateQuiz(prompt, options = {}) {
    let pythonProcess = null;
    
    const quizPromise = rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('Starting quiz generation:', {
                prompt,
                options,
                hasLocationAnalysis: !!options.locationAnalysis
            });
            
            pythonProcess = spawn('python', [
                pythonScript,
                'quiz',
                prompt,
                'null',  // no image
                JSON.stringify({
                    ...options,
                    locationAnalysis: options.locationAnalysis || ''
                })
            ], {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                timeout: 85000,
                detached: true, // Create new process group
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Unref the child process
            pythonProcess.unref();

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.log('Python stdout chunk:', chunk);
                dataString += chunk;
            });

            pythonProcess.stderr.on('data', (data) => {
                const chunk = data.toString('utf-8');
                console.error('Python stderr chunk:', chunk);
                errorString += chunk;
            });

            // Add timeout handler
            const timeoutId = setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Quiz generation timed out'));
            }, 85000);

            // Store cleanup function
            const cleanup = () => {
                clearTimeout(timeoutId);
                if (pythonProcess) {
                    try {
                        // Kill process more safely
                        pythonProcess.kill('SIGTERM');
                    } catch (error) {
                        console.error('Error during process cleanup:', error);
                    }
                    pythonProcess = null;
                }
            };

            // Add cancellation handler
            pythonProcess.cancel = cleanup;

            pythonProcess.on('close', (code) => {
                cleanup();
                if (code !== 0 && code !== null) { // Allow null for killed processes
                    console.error('Process error:', errorString);
                    reject(new Error(errorString || 'Quiz generation process failed'));
                    return;
                }

                try {
                    const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        console.error('No JSON found in response:', dataString);
                        reject(new Error('Invalid response format'));
                        return;
                    }
                    
                    const response = JSON.parse(jsonMatch[0]);
                    console.log('Quiz generation completed successfully');
                    
                    if (!response.success) {
                        reject(new Error(response.error || 'Failed to generate quiz'));
                        return;
                    }
                    
                    resolve(response.text);
                } catch (error) {
                    console.error('Parse error:', error);
                    console.error('Raw data:', dataString);
                    reject(new Error('Failed to parse quiz response'));
                }
            });

            pythonProcess.on('error', (error) => {
                cleanup();
                reject(error);
            });
        });
    });

    // Attach cancel method to the promise
    quizPromise.cancel = () => {
        if (pythonProcess) {
            try {
                pythonProcess.cancel();
            } catch (error) {
                console.error('Error during quiz cancellation:', error);
            }
        }
    };

    return quizPromise;
}

async function checkImageAppropriate(imagePath, options = {}) {
    return rateLimiter.enqueue(() => {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'gemini_service.py');
            
            console.log('aiService checking image appropriateness:', {
                imagePath,
                options
            });
            
            const pythonProcess = spawn('python', [
                pythonScript,
                'check_appropriate',
                'null', // no prompt needed
                imagePath,
                JSON.stringify(options)
            ]);

            let dataString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`Python Error: ${data}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python process exited with code ${code}`));
                    return;
                }
                
                try {
                    const response = JSON.parse(dataString);
                    console.log('Image appropriateness response:', response);
                    
                    if (!response.success) {
                        reject(new Error(response.error));
                        return;
                    }
                    
                    resolve({
                        success: true,
                        isAppropriate: response.isAppropriate,
                        reason: response.reason
                    });
                } catch (error) {
                    console.error('Parse error:', error);
                    reject(new Error('Failed to parse response'));
                }
            });
        });
    });
}

module.exports = {
    generateContent,
    generateContentStream,
    searchAndGenerate,
    analyzeImage,
    flashChat,
    analyzeBiome,
    analyze_weather,
    analyzeInfo,
    generateScenarios,
    gameSetup,
    gameMaster,
    gameSummary,
    generateQuiz,
    checkImageAppropriate
}; 