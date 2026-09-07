// 1. MUST BE FIRST: Load polyfills before Expo Router or ANY app code evaluates
require('./lib/polyfills');

// 2. Now boot Expo Router
require('expo-router/entry');