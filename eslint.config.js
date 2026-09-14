export default [{
  ignores: ["node_modules/**", "artifacts/**"],
}, {
  files: ["**/*.js"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  rules: {
    complexity: ["error", 8],
    "no-unused-vars": "error",
    "no-constant-condition": "error",
    "eqeqeq": "error",
  },
}];
