class ServiceRateLimiter {
    constructor() {
        // Configure different service types with specific limits
        this.queues = {
            vision: new Queue({
                interval: 4000,
                maxSize: 1000,
                maxConcurrent: 3,
                requestsPerMin: 60
            }),
            chat: new Queue({
                interval: 2000,
                maxSize: 1000,
                maxConcurrent: 2,
                requestsPerMin: 45
            }),
            game: new Queue({
                interval: 3000,
                maxSize: 1000,
                maxConcurrent: 2,
                requestsPerMin: 30
            }),
            analysis: new Queue({
                interval: 2000,
                maxSize: 1000,
                maxConcurrent: 4,
                requestsPerMin: 60
            }),
            quiz: new Queue({
                interval: 3000,
                maxSize: 1000,
                maxConcurrent: 2,
                requestsPerMin: 30
            })
        };
    }

    async enqueue(serviceType, task) {
        const queue = this.queues[serviceType];
        if (!queue) {
            throw new Error(`Unknown service type: ${serviceType}`);
        }
        return queue.enqueue(task);
    }

    getStatus(serviceType) {
        const queue = this.queues[serviceType];
        return queue ? queue.getStatus() : null;
    }
}

class Queue {
    constructor({ interval, maxSize, maxConcurrent, requestsPerMin }) {
        this.interval = interval;
        this.maxSize = maxSize;
        this.maxConcurrent = maxConcurrent;
        this.requestsPerMin = requestsPerMin;
        
        this.queue = [];
        this.activeCount = 0;
        this.lastCallTime = 0;
        this.requestTimes = [];
    }

    checkRateLimit() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        // Clean up old requests
        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
        
        return this.requestTimes.length < this.requestsPerMin;
    }

    async enqueue(task) {
        if (this.queue.length >= this.maxSize) {
            throw new Error('Queue is full');
        }

        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.processNext();
        });
    }

    async processNext() {
        // Don't process if at concurrent limit or queue is empty
        if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;

        // Check rate limit
        if (!this.checkRateLimit()) {
            const waitTime = Math.max(2000, this.interval);
            setTimeout(() => this.processNext(), waitTime);
            return;
        }

        this.activeCount++;
        const { task, resolve, reject } = this.queue.shift();

        const timeSinceLastCall = Date.now() - this.lastCallTime;
        const timeToWait = Math.max(0, this.interval - timeSinceLastCall);

        if (timeToWait > 0) {
            await new Promise(resolve => setTimeout(resolve, timeToWait));
        }

        try {
            this.lastCallTime = Date.now();
            this.requestTimes.push(Date.now());

            const result = await task();
            resolve(result);
        } catch (error) {
            if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
                console.warn(`Rate limit hit for task, requeueing...`);
                this.queue.unshift({ task, resolve, reject });
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                reject(error);
            }
        } finally {
            this.activeCount--;
            // Try to process next items in queue
            setTimeout(() => this.processNext(), 0);
        }
    }

    getStatus() {
        return {
            queueLength: this.queue.length,
            activeRequests: this.activeCount,
            requestsLastMinute: this.requestTimes.length,
            isRateLimited: !this.checkRateLimit()
        };
    }
}

module.exports = new ServiceRateLimiter(); 