// Service worker mínimo: solo habilita la instalación de la app (criterio de Chrome/Android).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
