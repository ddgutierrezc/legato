// swift-tools-version: 5.9
import PackageDescription

// NATIVE_ARTIFACTS:BEGIN
let legatoNativeArtifactContract = (
    packageUrl: "https://github.com/ddgutierrezc/legato-ios-core.git",
    packageName: "LegatoCore",
    product: "LegatoCore",
    versionPolicy: "exact",
    version: "0.1.1"
)
// iOS adapter switch-over is active: remote Swift package + exact pinning.
let legatoCorePackageDependency: Package.Dependency =
    .package(url: "https://github.com/ddgutierrezc/legato-ios-core.git", exact: "0.1.1")
// NATIVE_ARTIFACTS:END

let package = Package(
    name: "LegatoCapacitor",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "LegatoCapacitor",
            targets: ["LegatoPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        legatoCorePackageDependency
    ],
    targets: [
        .target(
            name: "LegatoPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "LegatoCore", package: "LegatoCore")
            ],
            path: "ios/Sources/LegatoPlugin"
        )
    ]
)
