const { NxAppWebpackPlugin } = require("@nx/webpack/app-plugin");
const { join } = require("path");

const workspaceRoot = join(__dirname, "../..");

module.exports = {
  context: workspaceRoot,
  output: {
    path: join(workspaceRoot, "dist/apps/metro-backend"),
    ...(process.env.NODE_ENV !== "production" && {
      devtoolModuleFilenameTemplate: "[absolute-resource-path]",
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: "node",
      compiler: "babel",
      main: "apps/metro-backend/src/main.ts",
      tsConfig: "apps/metro-backend/tsconfig.app.json",
      assets: [
        "apps/metro-backend/src/assets",
        {
          input: "libs/shared/rail-integration-contracts/src/assets/grpc",
          glob: "*.proto",
          output: "assets/grpc",
        },
      ],
      optimization: false,
      outputHashing: "none",
      generatePackageJson: true,
      sourceMaps: true,
    }),
  ],
};
