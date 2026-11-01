/**
 * Pre-paint theme boot script — injected as the first element of <body>.
 *
 * Runs during HTML parsing (before React hydrates) so the correct theme
 * class is on <html> before the first paint: no flash, no hydration error
 * (the <html> tag carries suppressHydrationWarning).
 *
 * Mirrors the logic of useUIStore: reads the persisted zustand payload
 * (`{"state":{"theme":"dark"},"version":0}`), falls back to the OS
 * preference when nothing is stored.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var raw=localStorage.getItem('khub-ui-storage');var theme=null;if(raw){try{var parsed=JSON.parse(raw);theme=parsed&&parsed.state?parsed.state.theme:null;}catch(e){}}if(theme!=='light'&&theme!=='dark'){theme=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var root=document.documentElement;if(theme==='dark'){root.classList.add('dark');root.style.colorScheme='dark';}else{root.classList.remove('dark');root.style.colorScheme='light';}}catch(e){}})();`;
