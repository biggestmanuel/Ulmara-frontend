// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Several chain libs bundle their own copy of @noble/hashes which expects Node's crypto
config.resolver.unstable_enablePackageExports = false;

config.resolver.extraNodeModules = {
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  events: require.resolve('events'),
  buffer: require.resolve('buffer/'),
  tronweb: require.resolve('tronweb/dist/TronWeb.js'),
};

module.exports = config;