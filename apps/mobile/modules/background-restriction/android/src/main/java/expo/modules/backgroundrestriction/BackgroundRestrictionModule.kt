package expo.modules.backgroundrestriction

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import androidx.core.content.PackageManagerCompat
import androidx.core.content.UnusedAppRestrictionsConstants
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Spec 082 D2 (smoke T101): "Permitir uso em segundo plano" desligado põe o app em
// "Restricted packages" e o AlarmManager SEGURA o alarme exato do crítico (medido no moto g06,
// Android 15: alarme 16:30 vencido e não entregue). Só este fato — nenhum dado de saúde.
class BackgroundRestrictionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BackgroundRestriction")

    // null = não se aplica (API < 28, sem a API) ou leitura indisponível.
    Function("isBackgroundRestricted") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return@Function null
      val context = appContext.reactContext ?: return@Function null
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        ?: return@Function null
      am.isBackgroundRestricted
    }

    // Spec 068 (hibernação): "Gerenciar o app fora de uso" / "Pausar atividade do app quando sem
    // uso" — ligada por padrão; após meses sem abrir, o SO revoga permissões e para notificações.
    // "enabled" | "disabled" | "unavailable" (sem o recurso ou erro de leitura). Nunca rejeita.
    AsyncFunction("getUnusedAppRestrictionsStatus") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve("unavailable")
        return@AsyncFunction
      }
      try {
        val future = PackageManagerCompat.getUnusedAppRestrictionsStatus(context)
        future.addListener({
          val status = try { future.get() } catch (e: Exception) { UnusedAppRestrictionsConstants.ERROR }
          promise.resolve(
            when (status) {
              UnusedAppRestrictionsConstants.API_30_BACKPORT,
              UnusedAppRestrictionsConstants.API_30,
              UnusedAppRestrictionsConstants.API_31 -> "enabled"
              UnusedAppRestrictionsConstants.DISABLED -> "disabled"
              else -> "unavailable"
            }
          )
        }, ContextCompat.getMainExecutor(context))
      } catch (e: Exception) {
        promise.resolve("unavailable")
      }
    }

    // Abre a tela do SO onde se desliga a hibernação do app. false = não abriu.
    Function("openUnusedAppRestrictionsSettings") {
      val context = appContext.reactContext ?: return@Function false
      try {
        val intent = IntentCompat.createManageUnusedAppRestrictionsIntent(context, context.packageName)
        val activity = appContext.currentActivity
        if (activity != null) {
          activity.startActivity(intent)
        } else {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        }
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
