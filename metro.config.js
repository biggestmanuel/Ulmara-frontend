// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Several chain libs (@ton/crypto, ethers, tronweb, ethereum-cryptography)
// bundle their own copy of @noble/hashes, whose package.json "exports" map
// resolves ./crypto.js to a Node-targeted file expecting Node's `crypto`
// module — which doesn't exist in Hermes, causing "undefined is not a
// function" at import time. Disabling package-exports resolution makes
// Metro fall back to main/browser fields instead, which resolve correctly
// on React Native. Known issue with @noble/hashes + Metro + Expo.
config.resolver.unstable_enablePackageExports = false;

config.resolver.extraNodeModules = {
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  events: require.resolve('events'),
  // Explicitly point to the npm 'buffer' package entry point.
  // The trailing slash ensures Node resolves to the node_modules package rather than a built-in.
  buffer: require.resolve('buffer/'),
  // tronweb's package.json only sets "main": "dist/TronWeb.node.js" (a Node build).
  // Aliasing to the browser UMD build avoids missing Node built-ins.
  tronweb: require.resolve('tronweb/dist/TronWeb.js'),
};

// IMPORTANT: module.exports MUST remain at the very end of the file
// so that all resolver modifications are included!
module.exports = config;