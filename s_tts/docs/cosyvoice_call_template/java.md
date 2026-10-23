import com.alibaba.dashscope.audio.ttsv2.enrollment.Voice;
import com.alibaba.dashscope.audio.ttsv2.enrollment.VoiceEnrollmentParam;
import com.alibaba.dashscope.audio.ttsv2.enrollment.VoiceEnrollmentService;
import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesisParam;
import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesizer;
import com.alibaba.dashscope.utils.Constants;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Collections;

public class Main {
    public static void main(String[] args) {
        Constants.baseWebsocketApiUrl = ""wss://dashscope.aliyuncs.com/api-ws/v1/inference"";
        Constants.baseHttpApiUrl = ""https://dashscope.aliyuncs.com/api/v1"";

        String apiKey = System.getenv(""DASHSCOPE_API_KEY"");
        String targetModel = ""cosyvoice-v3.5-flash"";
        String prefix = ""myvoice"";
        // Public network accessible audio URL. Please replace it with your own.
        String fileUrl = ""https://dashscope.oss-cn-beijing.aliyuncs.com/samples/audio/cosyvoice/cosyvoice-zeroshot-sample.wav"";
        String cloneModelName = ""voice-enrollment"";

        Voice myVoice = null;
        try {
            VoiceEnrollmentService service = new VoiceEnrollmentService(apiKey);
            myVoice = service.createVoice(
                    targetModel,
                    prefix,
                    fileUrl,
                    VoiceEnrollmentParam.builder()
                            .model(cloneModelName)
                            .languageHints(Collections.singletonList(""zh"")).build());

            System.out.println(""Voice creation submitted. Request ID: "" + service.getLastRequestId());
            System.out.println(""Generated Voice ID: "" + myVoice.getVoiceId());
        } catch (Exception e) {
            System.out.println(""Failed to create voice: "" + e.getMessage());
        }

        streamAudioDataToSpeaker(targetModel, myVoice.getVoiceId());
        System.exit(0);
    }

    public static void streamAudioDataToSpeaker(String targetModel, String voice) {
        SpeechSynthesisParam param =
                SpeechSynthesisParam.builder()
                        .apiKey(System.getenv(""DASHSCOPE_API_KEY""))
                        .model(targetModel)
                        .voice(voice)
                        .build();

        SpeechSynthesizer synthesizer = new SpeechSynthesizer(param, null);
        ByteBuffer audio = null;
        try {
            audio = synthesizer.call(""How is the weather today?"");
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            synthesizer.getDuplexApi().close(1000, ""bye"");
        }
        if (audio != null) {
            File file = new File(""output.mp3"");
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(audio.array());
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
    }
}