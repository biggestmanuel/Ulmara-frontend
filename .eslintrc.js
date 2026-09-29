module.exports = {
  extends: 'expo',
  ignorePatterns: ['dist/'],
  rules: {
    'react-hooks/set-state-in-effect': 'off',
  },
  overrides: [
    {
      // Standalone Node verification scripts (scripts/*.mjs) run under Node,
      // not Metro — Buffer and other Node globals are available there.
      files: ['scripts/*.mjs'],
      env: { node: true },
    },
  ],
};
