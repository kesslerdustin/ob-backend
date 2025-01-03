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
                    if (response.success) {
                        resolve(response.text);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    resolve(dataString);
                }
            });
        });
    });
}

module.exports = {
    generateContent,
    generateContentStream,
    searchAndGenerate,
    analyzeImage
}; 