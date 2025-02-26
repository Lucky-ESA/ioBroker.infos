// iobroker prettier configuration file
import prettierConfig from "@iobroker/eslint-config/prettier.config.mjs";

export default {
    ...prettierConfig,
    ignores: [
        ".dev-server/",
        ".github/*",
        ".vscode/",
        "*.test.js",
        "test/**/*.js",
        "widgets",
        "*.config.mjs",
        "admin/words.js",
        "admin/lib",
        "**/adapter-config.d.ts",
    ],
    semi: true,
    trailingComma: "all",
    singleQuote: false,
    printWidth: 120,
    useTabs: false,
    tabWidth: 4,
    endOfLine: "lf",
    // uncomment next line if you prefer double quotes
    // singleQuote: false,
};
