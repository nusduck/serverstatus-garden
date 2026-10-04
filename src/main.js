import {createApp} from 'vue';
// Self-hosted Latin faces; CJK falls back to the system's PingFang / YaHei / Noto.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import App from './App.vue';
import './style.css';
createApp(App).mount('#app');
