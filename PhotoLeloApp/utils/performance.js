// Performance monitoring utilities
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.isEnabled = __DEV__; // Only enable in development
  }

  startTimer(label) {
    if (!this.isEnabled) return;
    this.metrics.set(label, Date.now());
  }

  endTimer(label) {
    if (!this.isEnabled) return;
    const startTime = this.metrics.get(label);
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`⏱️ ${label}: ${duration}ms`);
      this.metrics.delete(label);
      return duration;
    }
  }

  measureAsync(label, asyncFn) {
    if (!this.isEnabled) return asyncFn();
    
    return new Promise(async (resolve, reject) => {
      this.startTimer(label);
      try {
        const result = await asyncFn();
        this.endTimer(label);
        resolve(result);
      } catch (error) {
        this.endTimer(label);
        reject(error);
      }
    });
  }

  logMemoryUsage(label = 'Memory Usage') {
    if (!this.isEnabled) return;
    
    if (global.performance && global.performance.memory) {
      const memory = global.performance.memory;
      console.log(`📊 ${label}:`, {
        used: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB`,
        total: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB`,
        limit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB`
      });
    }
  }
}

export const performanceMonitor = new PerformanceMonitor();

// HOC for measuring component render time
export const withPerformanceMonitoring = (WrappedComponent, componentName) => {
  return React.forwardRef((props, ref) => {
    React.useEffect(() => {
      performanceMonitor.logMemoryUsage(`${componentName} Mount`);
    }, []);

    return React.createElement(WrappedComponent, { ...props, ref });
  });
};

// Hook for measuring function execution time
export const usePerformanceTimer = (label) => {
  return React.useCallback((fn) => {
    return performanceMonitor.measureAsync(label, fn);
  }, [label]);
};