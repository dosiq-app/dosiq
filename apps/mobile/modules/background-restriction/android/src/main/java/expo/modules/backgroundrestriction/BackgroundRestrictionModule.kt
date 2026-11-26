package expo.modules.backgroundrestriction

import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.NotificationManager
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
private const val MIUI_OP_SHOW_WHEN_LOCKED = 10020

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

    // Spec 128 A (054 T007d): "Notificações em tela cheia" (Android 14+) — o alarme crítico só abre
    // por cima da tela bloqueada se o app puder usar full-screen intent. Abaixo da API 34 a permissão
    // é concedida na instalação ⇒ true. null = leitura indisponível (desconhecido nunca vira negativo).
    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return@Function true
      val context = appContext.reactContext ?: return@Function null
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
          ?: return@Function null
        nm.canUseFullScreenIntent()
      } catch (e: Exception) {
        null
      }
    }

    // Spec 128 C-6 (matriz POCO HyperOS/Android 16, 2026-11-26): "Mostrar na Tela de bloqueio"
    // (Informações do app › Outras permissões) é o appop proprietário MIUIOP(10020). Sem ele o alarme
    // toca mas NÃO abre a tela cheia com o celular bloqueado (medido). Código não documentado, mesmo
    // valor no MIUI e no HyperOS. true = permitido · false = negado · null = não é MIUI/HyperOS, op
    // desconhecido ou leitura indisponível (desconhecido nunca vira negativo).
    Function("miuiShowWhenLocked") {
      val context = appContext.reactContext ?: return@Function null
      try {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
          ?: return@Function null
        val check = AppOpsManager::class.java.getMethod(
          "checkOpNoThrow", Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, String::class.java
        )
        val mode = check.invoke(ops, MIUI_OP_SHOW_WHEN_LOCKED, context.applicationInfo.uid, context.packageName) as Int
        when (mode) {
          AppOpsManager.MODE_ALLOWED -> true
          AppOpsManager.MODE_IGNORED, AppOpsManager.MODE_ERRORED -> false
          else -> null
        }
      } catch (e: Exception) {
        null
      }
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
