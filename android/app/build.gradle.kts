plugins {
    id("com.android.application")
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

// The version comes from package.json, so the web app, the phone apps and the server agree.
// Google Play needs a bigger version code for every upload: 1.5.0 is 10500, 1.5.1 is 10501.
val appVersion: String = Regex("\"version\"\\s*:\\s*\"(\\d+\\.\\d+\\.\\d+)\"")
    .find(rootProject.file("../package.json").readText())!!.groupValues[1]
val appVersionCode: Int = appVersion.split(".").map { it.toInt() }.let { (major, minor, patch) -> major * 10000 + minor * 100 + patch }

android {
    namespace = "com.shira421.haven"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.shira421.haven"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersion
    }

    buildFeatures {
        buildConfig = true
    }

    // The web app built by `npm run build` is packed into the app as its assets.
    sourceSets.getByName("main").assets.srcDir(rootProject.file("../dist"))

    // The keystore (see PLAY.md) signs every build with the same key. For Google Play it is the
    // upload key; for the APK on GitHub it lets a new build install over the old one.
    val keystore = System.getenv("HAVEN_KEYSTORE_FILE")
    val signed = !keystore.isNullOrBlank()
    if (signed) {
        signingConfigs.create("upload") {
            storeFile = file(keystore!!)
            storePassword = System.getenv("HAVEN_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("HAVEN_KEY_ALIAS") ?: "haven"
            keyPassword = System.getenv("HAVEN_KEY_PASSWORD") ?: System.getenv("HAVEN_KEYSTORE_PASSWORD")
        }
        signingConfigs.getByName("debug") {
            storeFile = file(keystore!!)
            storePassword = System.getenv("HAVEN_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("HAVEN_KEY_ALIAS") ?: "haven"
            keyPassword = System.getenv("HAVEN_KEY_PASSWORD") ?: System.getenv("HAVEN_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        debug {
            // Only the device test in CI turns this on: it lets the test drive the web view.
            buildConfigField("boolean", "WEB_DEBUG", if (System.getenv("HAVEN_WEB_DEBUG") == "1") "true" else "false")
        }
        release {
            buildConfigField("boolean", "WEB_DEBUG", "false")
            // Haven's Java is small and uses no reflection beyond the web view bridge, so the code is
            // left as written: nothing for a shrinker to break that no test would catch.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Without the keystore a release build is signed with the debug key: fine for testing,
            // refused by Google Play.
            signingConfig = signingConfigs.getByName(if (signed) "upload" else "debug")
        }
    }

    lint {
        // Play rejects a build that targets an old Android; catch it here first.
        checkReleaseBuilds = true
        abortOnError = false
    }
}
