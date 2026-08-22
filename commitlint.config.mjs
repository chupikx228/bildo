export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "bil-jira-key": (parsed) => {
          const pass = /BIL-\d+/.test(parsed.raw ?? "");
          return [
            pass,
            "reference a Jira key like BIL-42 in the footer (see CONTRIBUTING.md); omit only for trivial chore/ci commits",
          ];
        },
      },
    },
  ],
  rules: {
    "bil-jira-key": [1, "always"],
  },
};
