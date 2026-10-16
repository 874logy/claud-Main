import SwiftUI

@main
struct JarvisApp: App {
    @State private var conversation = Conversation()

    var body: some Scene {
        WindowGroup {
            ContentView(conversation: conversation)
                .preferredColorScheme(.dark)
        }
    }
}
