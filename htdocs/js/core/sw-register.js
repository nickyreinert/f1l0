    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
        if (isLocalhost) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((reg) => reg.unregister()));
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          } catch {}
          return;
        }
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
