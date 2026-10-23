# generate custom voice

curl --request POST \
  --url https://hk.n1n.ai/kling/v1/general/custom-voices \
  --header 'Authorization: Bearer <api_key>' \
  --header 'Content-Type: application/json' \
  --data '{
    "video_id": "",
    "voice_url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-qa-test/out.mp3",
    "voice_name": "Custom Voice",
    "callback_url": ""
  }'

# get preset voice

curl --request GET \
  --url 'https://hk.n1n.ai/kling/v1/general/presets-voices?pageNum=1&pageSize=30' \
  --header 'Authorization: Bearer <api_key>'

# get custom voice

curl --request GET \
  --url 'https://hk.n1n.ai/kling/v1/general/custom-voices/<task_id>' \
  --header 'Authorization: Bearer <api_key>'

# tts

curl --request POST \
  --url https://hk.n1n.ai/kling/v1/audio/tts \
  --header 'Authorization: Bearer <api_key>' \
  --header 'Content-Type: application/json' \
  --data '{
    "text": "Throughout my time in college, several memorable event left a significant impact on my life",
    "voice_id": "oversea_male1",
    "voice_language": "en",
    "voice_speed": 1
  }'

