// swift-tools-version: 5.9
import PackageDescription

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
        .package(path: "../../../../../native/ios/LegatoCore")
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
