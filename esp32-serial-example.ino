// Koushalya ESP32 serial example
// Sends newline-delimited JSON at 115200 baud for the web app's Web Serial reader.

void setup() {
  Serial.begin(115200);
}

void loop() {
  int heartRate = 72 + random(-5, 9);
  int spo2 = 97 + random(0, 3);
  float temperature = 36.5 + (random(0, 8) / 10.0);
  int systolic = 120 + random(-4, 8);
  int diastolic = 78 + random(-3, 5);

  Serial.print("{\"heartRate\":");
  Serial.print(heartRate);
  Serial.print(",\"spo2\":");
  Serial.print(spo2);
  Serial.print(",\"temperature\":");
  Serial.print(temperature, 1);
  Serial.print(",\"systolic\":");
  Serial.print(systolic);
  Serial.print(",\"diastolic\":");
  Serial.print(diastolic);
  Serial.println("}");

  delay(2000);
}
