// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorLegato",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "CapacitorLegato",
            targets: ["LegatoPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.1"),
        .package(path: "../../native/ios/LegatoCore")
    ],
    targets: [
        .target(
            name: "LegatoPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "LegatoCore", package: "LegatoCore")
            ],
            path: "ios/Sources/LegatoPlugin"
        )
    ]
)
