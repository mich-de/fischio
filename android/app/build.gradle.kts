plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val appUrl = (project.findProperty("fischio.url") as String?) ?: "https://IL-TUO-PROGETTO.vercel.app"

android {
    namespace = "it.fischio.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "it.fischio.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "APP_URL", "\"$appUrl\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Firma con la chiave di debug: comodo per installare l'APK sul tuo telefono.
            // Per pubblicare su Google Play crea una chiave tua (Build > Generate Signed App Bundle).
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
