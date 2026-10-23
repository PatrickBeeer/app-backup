# Voice changer

POST https://api.elevenlabs.io/v1/speech-to-speech/{voice_id}
Content-Type: multipart/form-data

Transform audio from one voice to another. Maintain full control over emotion, timing and delivery.

Reference: https://elevenlabs.io/docs/api-reference/speech-to-speech/convert

## Servers

- `https://api.elevenlabs.io` (Production, default)
- `https://api.us.elevenlabs.io` (Production US)
- `https://api.eu.residency.elevenlabs.io` (Production EU)
- `https://api.in.residency.elevenlabs.io` (Production India)
- `https://api.sg.residency.elevenlabs.io` (Production Singapore)

## Request

### Path parameters

- `voice_id` (string, required) — ID of the voice to be used. Use the [Get voices](/docs/api-reference/voices/search) endpoint list all the available voices.

### Query parameters

- `enable_logging` (boolean, optional, default: true) — When enable_logging is set to false zero retention mode will be used for the request. This will mean history features are unavailable for this request, including request stitching. Zero retention mode may only be used by enterprise customers.
- `optimize_streaming_latency` (integer, optional, nullable, deprecated) — You can turn on latency optimizations at some cost of quality. The best possible final latency varies by model. Possible values: 0 - default mode (no latency optimizations) 1 - normal latency optimizations (about 50% of possible latency improvement of option 3) 2 - strong latency optimizations (about 75% of possible latency improvement of option 3) 3 - max latency optimizations 4 - max latency optimizations, but also with text normalizer turned off for even more latency savings (best latency, but can mispronounce eg numbers and dates). Defaults to None.
- `output_format` (enum, optional, default: mp3_44100_128) — Output format of the generated audio. Formatted as codec_sample_rate_bitrate. So an mp3 with 22.05kHz sample rate at 32kbs is represented as mp3_22050_32. MP3 with 192kbps bitrate requires you to be subscribed to Creator tier or above. PCM and WAV formats with 44.1kHz sample rate requires you to be subscribed to Pro tier or above. Note that the μ-law format (sometimes written mu-law, often approximated as u-law) is commonly used for Twilio audio inputs.
  - Allowed values: `alaw_8000`, `mp3_22050_32`, `mp3_24000_48`, `mp3_44100_128`, `mp3_44100_192`, `mp3_44100_32`, `mp3_44100_64`, `mp3_44100_96`, `opus_48000_128`, `opus_48000_192`, `opus_48000_32`, `opus_48000_64`, `opus_48000_96`, `pcm_16000`, `pcm_22050`, `pcm_24000`, `pcm_32000`, `pcm_44100`, `pcm_48000`, `pcm_8000`, `ulaw_8000`, `wav_16000`, `wav_22050`, `wav_24000`, `wav_32000`, `wav_44100`, `wav_48000`, `wav_8000`

### Body (multipart/form-data)

- `audio` (file, required) — The audio file which holds the content and emotion that will control the generated speech.
- `model_id` (string, optional) — Identifier of the model that will be used, you can query them using GET /v1/models. The model needs to have support for speech to speech, you can check this using the can_do_voice_conversion property.
- `voice_settings` (string, optional) — Voice settings overriding stored settings for the given voice. They are applied only on the given request. Needs to be send as a JSON encoded string.
- `seed` (integer, optional) — If specified, our system will make a best effort to sample deterministically, such that repeated requests with the same seed and parameters should return the same result. Determinism is not guaranteed. Must be integer between 0 and 4294967295.
- `remove_background_noise` (boolean, optional) — If set, will remove the background noise from your audio input using our audio isolation model. Only applies to Voice Changer.
- `file_format` (enum, optional) — The format of input audio. Options are 'pcm_s16le_16' or 'other' For `pcm_s16le_16`, the input audio must be 16-bit PCM at a 16kHz sample rate, single channel (mono), and little-endian byte order. Latency will be lower than with passing an encoded waveform.

## Response

### 200

The generated audio file

- File download.

## Examples

**Request**

```json
{
  "audio": "<file: <file1>>",
  "model_id": "eleven_multilingual_sts_v2"
}
```

**SDK Code**

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

async function main() {
    const client = new ElevenLabsClient({
        apiKey: "xi-api-key",
    });
    await client.speechToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
        outputFormat: "mp3_44100_128",
    });
}
main();

```

```python
from elevenlabs import ElevenLabs

client = ElevenLabs(
    api_key="xi-api-key",
)

client.speech_to_speech.convert(
    voice_id="JBFqnCBsd6RMkjVDRZzb",
    output_format="mp3_44100_128",
    audio="example_audio",
)

```

```go
package main

import (
	"fmt"
	"strings"
	"net/http"
	"io"
)

func main() {

	url := "https://api.elevenlabs.io/v1/speech-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128"

	payload := strings.NewReader("-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"<file1>\"\r\nContent-Type: application/octet-stream\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"file_format\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\neleven_multilingual_sts_v2\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"remove_background_noise\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"seed\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"voice_settings\"\r\n\r\n\r\n-----011000010111000001101001--\r\n")

	req, _ := http.NewRequest("POST", url, payload)

	req.Header.Add("xi-api-key", "xi-api-key")
	req.Header.Add("Content-Type", "multipart/form-data; boundary=---011000010111000001101001")

	res, _ := http.DefaultClient.Do(req)

	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	fmt.Println(res)
	fmt.Println(string(body))

}
```

```ruby
require 'uri'
require 'net/http'

url = URI("https://api.elevenlabs.io/v1/speech-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128")

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = true

request = Net::HTTP::Post.new(url)
request["xi-api-key"] = 'xi-api-key'
request["Content-Type"] = 'multipart/form-data; boundary=---011000010111000001101001'
request.body = "-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"<file1>\"\r\nContent-Type: application/octet-stream\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"file_format\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\neleven_multilingual_sts_v2\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"remove_background_noise\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"seed\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"voice_settings\"\r\n\r\n\r\n-----011000010111000001101001--\r\n"

response = http.request(request)
puts response.read_body
```

```java
import com.mashape.unirest.http.HttpResponse;
import com.mashape.unirest.http.Unirest;

HttpResponse<String> response = Unirest.post("https://api.elevenlabs.io/v1/speech-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128")
  .header("xi-api-key", "xi-api-key")
  .header("Content-Type", "multipart/form-data; boundary=---011000010111000001101001")
  .body("-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"<file1>\"\r\nContent-Type: application/octet-stream\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"file_format\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\neleven_multilingual_sts_v2\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"remove_background_noise\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"seed\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"voice_settings\"\r\n\r\n\r\n-----011000010111000001101001--\r\n")
  .asString();
```

```php
<?php
require_once('vendor/autoload.php');

$client = new \GuzzleHttp\Client();

$response = $client->request('POST', 'https://api.elevenlabs.io/v1/speech-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128', [
  'multipart' => [
    [
        'name' => 'audio',
        'filename' => '<file1>',
        'contents' => null
    ],
    [
        'name' => 'model_id',
        'contents' => 'eleven_multilingual_sts_v2'
    ]
  ]
  'headers' => [
    'xi-api-key' => 'xi-api-key',
  ],
]);

echo $response->getBody();
```

```csharp
using RestSharp;

var client = new RestClient("https://api.elevenlabs.io/v1/speech-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128");
var request = new RestRequest(Method.POST);
request.AddHeader("xi-api-key", "xi-api-key");
request.AddParameter("multipart/form-data; boundary=---011000010111000001101001", "-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"<file1>\"\r\nContent-Type: application/octet-stream\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"file_format\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\neleven_multilingual_sts_v2\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"remove_background_noise\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"seed\"\r\n\r\n\r\n-----011000010111000001101001\r\nContent-Disposition: form-data; name=\"voice_settings\"\r\n\r\n\r\n-----011000010111000001101001--\r\n", ParameterType.RequestBody);
IRestResponse response = client.Execute(request);
```

```swift
import Foundation

let headers = [
  "xi-api-key": "xi-api-key",
  "Content-Type": "multipart/form-data; boundary=---011000010111000001101001"
]
let parameters = [
  [
    "name": "audio",
    "fileName": "<file1>"
  ],
  [
    "name": "file_format",
    "value": 
  ],
  [
    "name": "model_id",
    "value": "eleven_multilingual_sts_v2"
  ],
  [
    "name": "remove_background_noise",
    "value": 
  ],
  [
    "name": "seed",
    "value": 
  ],
  [
    "name": "voice_settings",
    "value": 
  ]
]

let boundary = "---011000010111000001101001"

var body = ""
var error: NSError? = nil
for param in parameters {
  let paramName = param["name"]!
  body += "--\(boundary)\r\n"
  body += "Content-Disposition:form-data; name=\"\(paramName)\""
  if let filename = param["fileName"] {
    let contentType = param["content-type"]!
    let fileContent = String(contentsOfFile: filename, encoding: String.Encoding.utf8)
    if (error != nil) {
      print(error as Any)
    }
    body += "; filename=\"\(filename)\"\r\n"
    body += "Content-Type: \(contentType)\r\n\r\n"
    body += fileContent
  } else if let paramValue = param["value"] {
    body += "\r\n\r\n\(paramValue)"
  }
}

let request = NSMutableURLRequest(url: NSURL(string: "https://api.elevenlabs.io/v1/speech-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128")! as URL,
                                        cachePolicy: .useProtocolCachePolicy,
                                    timeoutInterval: 10.0)
request.httpMethod = "POST"
request.allHTTPHeaderFields = headers
request.httpBody = postData as Data

let session = URLSession.shared
let dataTask = session.dataTask(with: request as URLRequest, completionHandler: { (data, response, error) -> Void in
  if (error != nil) {
    print(error as Any)
  } else {
    let httpResponse = response as? HTTPURLResponse
    print(httpResponse)
  }
})

dataTask.resume()
```