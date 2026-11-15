plugins {
    id("com.android.application")
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

android {
    namespace = "com.shira421.haven"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.shira421.haven"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "1.3.0"
        // Only the device test in CI turns this on: it lets the test drive the web view.
        buildConfigField("boolean", "WEB_DEBUG", if (System.getenv("HAVEN_WEB_DEBUG") == "1") "true" else "false")
    }

    buildFeatures {
        buildConfig = true
    }

    // The web app built by `npm run build` is packed into the APK as its assets.
    sourceSets.getByName("main").assets.srcDir(rootProject.file("../dist"))

    // With a keystore (see README, "Keeping your haven across Android updates") every build is signed
    // with the same key, so a new APK installs over the old one and keeps its data.
    val keystore = System.getenv("HAVEN_KEYSTORE_FILE")
    if (!keystore.isNullOrBlank()) {
        signingConfigs.getByName("debug") {
            storeFile = file(keystore)
            storePassword = System.getenv("HAVEN_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("HAVEN_KEY_ALIAS") ?: "haven"
            keyPassword = System.getenv("HAVEN_KEY_PASSWORD") ?: System.getenv("HAVEN_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
