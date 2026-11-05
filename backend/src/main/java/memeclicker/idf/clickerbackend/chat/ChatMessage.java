package memeclicker.idf.clickerbackend.chat;

public record ChatMessage(String id, String nickname, String text, long sentAt) {
}
