package expo.modules.legato

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LegatoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Legato")
  }
}
