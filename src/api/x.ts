export interface TweetResponse {
  data: {
    id: string;
    text: string;
  };
}

export interface TweetMetrics {
  tweet_id: string;
  impressions: number;
  engagements: number;
  engagement_rate: number;
}

export class XAPIClient {
  private apiKey: string;
  private apiSecret: string;
  private accessToken: string;
  private accessSecret: string;

  constructor(apiKey: string, apiSecret: string, accessToken: string, accessSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken;
    this.accessSecret = accessSecret;
  }

  /**
   * OAuth 1.0a署名を生成
   */
  private async generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>
  ): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.apiKey,
      oauth_token: this.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0',
      ...params
    };

    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
      .join('&');

    const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(this.apiSecret)}&${encodeURIComponent(this.accessSecret)}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    const messageData = encoder.encode(signatureBase);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

    return signatureBase64;
  }

  /**
   * OAuth 1.0aヘッダーを生成
   */
  private async generateOAuthHeader(method: string, url: string, params: Record<string, string> = {}): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const signature = await this.generateOAuthSignature(method, url, params);

    const oauthParams = {
      oauth_consumer_key: this.apiKey,
      oauth_token: this.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0',
      oauth_signature: signature
    };

    const headerValue = Object.entries(oauthParams)
      .map(([key, value]) => `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`)
      .join(', ');

    return `OAuth ${headerValue}`;
  }

  /**
   * ツイートを投稿
   */
  async postTweet(text: string): Promise<TweetResponse> {
    const url = 'https://api.twitter.com/2/tweets';
    const body = JSON.stringify({ text });

    const authHeader = await this.generateOAuthHeader('POST', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`X API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    return await response.json();
  }

  /**
   * ツイートのメトリクスを取得
   */
  async getTweetMetrics(tweetIds: string[]): Promise<TweetMetrics[]> {
    const url = `https://api.twitter.com/2/tweets?ids=${tweetIds.join(',')}&tweet.fields=public_metrics`;

    const authHeader = await this.generateOAuthHeader('GET', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader
      }
    });

    if (!response.ok) {
      throw new Error(`X API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return data.data.map((tweet: any) => ({
      tweet_id: tweet.id,
      impressions: tweet.public_metrics.impression_count || 0,
      engagements:
        (tweet.public_metrics.like_count || 0) +
        (tweet.public_metrics.retweet_count || 0) +
        (tweet.public_metrics.reply_count || 0) +
        (tweet.public_metrics.quote_count || 0),
      engagement_rate:
        tweet.public_metrics.impression_count > 0
          ? ((tweet.public_metrics.like_count +
              tweet.public_metrics.retweet_count +
              tweet.public_metrics.reply_count +
              tweet.public_metrics.quote_count) /
              tweet.public_metrics.impression_count) *
            100
          : 0
    }));
  }
}
