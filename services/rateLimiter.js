class RateLimiter {
    constructor(interval = 4000, maxQueueSize = 1000) {
        this.maxQueueSize = maxQueueSize;
        this.queue = [];
        this.isProcessing = false;
        this.interval = interval;
        this.lastCallTime = 0;
    }

    async enqueue(task) {
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error('Queue is full. Please try again later.');
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        
        this.isProcessing = true;
        
        while (this.queue.length > 0) {
            const timeSinceLastCall = Date.now() - this.lastCallTime;
            const timeToWait = Math.max(0, this.interval - timeSinceLastCall);
            
            if (timeToWait > 0) {
                await new Promise(resolve => setTimeout(resolve, timeToWait));
            }

            const { task, resolve, reject } = this.queue.shift();
            
            try {
                this.lastCallTime = Date.now();
                const result = await task();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }

        this.isProcessing = false;
    }
}

module.exports = new RateLimiter(); 