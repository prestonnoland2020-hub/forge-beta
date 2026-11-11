import UIKit
import Capacitor

/* Capacitor's view controller, plus Forge's own native pieces that are not
   npm plugins (the live workout ticker). */
class ForgeBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ForgeLiveActivityPlugin())
    }
}
