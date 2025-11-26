export interface SlackNotification {
  text: string;
  attachments?: Array<{
    color?: string;
    title?: string;
    text?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
  }>;
}

export class SlackClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendNotification(notification: SlackNotification): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.status} ${response.statusText}`);
    }
  }

  async notifyPostSuccess(
    articleTitle: string,
    articleUrl: string,
    tweetId: string,
    score: number
  ): Promise<void> {
    await this.sendNotification({
      text: '新しい記事を投稿しました！',
      attachments: [
        {
          color: 'good',
          title: articleTitle,
          text: articleUrl,
          fields: [
            {
              title: 'スコア',
              value: score.toString(),
              short: true
            },
            {
              title: 'ツイートID',
              value: tweetId,
              short: true
            }
          ]
        }
      ]
    });
  }

  async notifyError(error: string): Promise<void> {
    await this.sendNotification({
      text: 'エラーが発生しました',
      attachments: [
        {
          color: 'danger',
          text: error
        }
      ]
    });
  }
}
