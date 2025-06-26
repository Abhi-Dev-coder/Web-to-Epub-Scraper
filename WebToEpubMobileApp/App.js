import React from 'react';
import { StyleSheet, SafeAreaView, Platform, StatusBar, View, Text, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Require the local index.html file.
const localHtmlSource = require('./assets/www/index.html');

export default function App() {
  const asset = Asset.fromModule(localHtmlSource);
  const localUri = asset.uri;

  const handleWebViewMessage = async (event) => {
    const messageDataString = event.nativeEvent.data;
    console.log('Message from WebView:', messageDataString);
    try {
      const messageData = JSON.parse(messageDataString);
      if (messageData.type === 'epubGenerated') {
        const { filename, data, mimeType } = messageData;

        // Data is a data URL: "data:application/epub+zip;base64,THE_ACTUAL_BASE64_STRING..."
        // We need to strip the prefix to get the pure base64 content.
        const base64Prefix = `data:${mimeType};base64,`;
        let pureBase64Data = data;
        if (data.startsWith(base64Prefix)) {
          pureBase64Data = data.substring(base64Prefix.length);
        } else {
          // Fallback or error if prefix is not as expected, though FileReader usually includes it.
          console.warn("Base64 data prefix was not as expected. Using raw data.");
        }

        const localPath = `${FileSystem.cacheDirectory}${filename}`; // Use cacheDirectory for temporary files

        console.log(`Attempting to save EPUB to: ${localPath}`);

        await FileSystem.writeAsStringAsync(localPath, pureBase64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log('EPUB saved successfully to:', localPath);

        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert('Sharing not available', 'Sharing functionality is not available on this device.');
          // Optionally, provide path to user:
          // Alert.alert('EPUB Saved', `File saved at: ${localPath}. You can access it using a file manager.`);
          return;
        }

        await Sharing.shareAsync(localPath, {
          mimeType: mimeType,
          dialogTitle: `Share or save ${filename}`,
          UTI: 'public.epub-book', // For iOS, helps identify file type
        });
        console.log('Sharing dialog prompted.');

      }
    } catch (error) {
      console.error('Error processing message from WebView or saving/sharing file:', error);
      Alert.alert('Error', `Failed to save or share EPUB: ${error.message}`);
    }
  };

  if (!localUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredMessage}>
          <Text>Error: Could not load local HTML file.</Text>
          <Text>Asset URI is null for localHtmlSource.</Text>
        </View>
      </SafeAreaView>
    );
  }

  console.log('WebView URI:', localUri);

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        source={{ uri: localUri }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*', 'file://*', 'http://*', 'https://*']}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error: ', nativeEvent);
          Alert.alert('WebView Error', `Failed to load content: ${nativeEvent.description}`);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn(
            'WebView HTTP error: ',
            nativeEvent.url,
            nativeEvent.statusCode,
            nativeEvent.description
          );
        }}
        onLoadEnd={() => {
          console.log('WebView content loaded from local asset');
        }}
        onMessage={handleWebViewMessage} // Added onMessage handler
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
  },
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  }
});
