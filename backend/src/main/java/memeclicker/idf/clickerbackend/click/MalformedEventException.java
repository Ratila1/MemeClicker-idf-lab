package memeclicker.idf.clickerbackend.click;

/** Сообщение в Kafka не разбирается: ретраи бессмысленны, сразу в DLQ. */
public class MalformedEventException extends RuntimeException {

    public MalformedEventException(String message, Throwable cause) {
        super(message, cause);
    }
}
