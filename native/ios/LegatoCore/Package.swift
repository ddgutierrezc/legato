// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LegatoCore",
    platforms: [
        .iOS(.v14)
    ],
    products: [
        .library(
            name: "LegatoCore",
            targets: ["LegatoCore"]
        )
    ],
    targets: [
        .target(
            name: "LegatoCore",
            path: "Sources/LegatoCore"
        )
    ]
)
