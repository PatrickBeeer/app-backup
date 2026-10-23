import os
import time
import dashscope
from dashscope.audio.tts_v2 import VoiceEnrollmentService, SpeechSynthesizer

dashscope.base_websocket_api_url='wss://dashscope.aliyuncs.com/api-ws/v1/inference'
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

dashscope.api_key = os.getenv(""DASHSCOPE_API_KEY"")
if not dashscope.api_key:
    raise ValueError(""DASHSCOPE_API_KEY environment variable not set."")

TARGET_MODEL = ""cosyvoice-v3.5-flash"" 
VOICE_PREFIX = ""myvoice""
# Public network accessible audio URL. Please replace it with your own.
AUDIO_URL = ""https://dashscope.oss-cn-beijing.aliyuncs.com/samples/audio/cosyvoice/cosyvoice-zeroshot-sample.wav""

print(""--- Step 1: Creating voice enrollment ---"")
service = VoiceEnrollmentService()
try:
    voice_id = service.create_voice(
        target_model=TARGET_MODEL,
        prefix=VOICE_PREFIX,
        url=AUDIO_URL
    )
    print(f""Voice enrollment submitted successfully. Request ID: {service.get_last_request_id()}"")
    print(f""Generated Voice ID: {voice_id}"")
except Exception as e:
    print(f""Error during voice creation: {e}"")
    raise e

print(""\n--- Step 2: Polling for voice status ---"")
max_attempts = 30
poll_interval = 10
for attempt in range(max_attempts):
    try:
        voice_info = service.query_voice(voice_id=voice_id)
        status = voice_info.get(""status"")
        print(f""Attempt {attempt + 1}/{max_attempts}: Voice status is '{status}'"")
        
        if status == ""OK"":
            print(""Voice is ready for synthesis."")
            break
        elif status == ""UNDEPLOYED"":
            print(f""Voice processing failed with status: {status}. Please check audio quality or contact support."")
            raise RuntimeError(f""Voice processing failed with status: {status}"")
        time.sleep(poll_interval)
    except Exception as e:
        print(f""Error during status polling: {e}"")
        time.sleep(poll_interval)
else:
    print(""Polling timed out. The voice is not ready after several attempts."")
    raise RuntimeError(""Polling timed out. The voice is not ready after several attempts."")


print(""\n--- Step 3: Synthesizing speech with the new voice ---"")
try:
    synthesizer = SpeechSynthesizer(model=TARGET_MODEL, voice=voice_id)
    text_to_synthesize = ""How is the weather today?""
    
    audio_data = synthesizer.call(text_to_synthesize)
    print(f""Speech synthesis successful. Request ID: {synthesizer.get_last_request_id()}"")

    output_file = ""my_custom_voice_output.mp3""
    with open(output_file, ""wb"") as f:
        f.write(audio_data)
    print(f""Audio saved to {output_file}"")

except Exception as e:
    print(f""Error during speech synthesis: {e}"")