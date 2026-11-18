plugins {
    // 8.11 builds for Android 16 (API 36), which Google Play requires from 31 August 2026.
    // It needs Gradle 8.13 or newer; CI uses 8.14.3.
    id("com.android.application") version "9.5.1" apply false
}
