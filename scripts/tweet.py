from dataclasses import dataclass
import requests
from twikit import Client
from typing import List, Optional
import os
import datetime as dt


async def build_twikit_client():
    USERNAME = os.getenv('TWITTER_USERNAME')
    EMAIL = os.getenv('TWITTER_EMAIL')
    PASSWORD = os.getenv('TWITTER_PASSWORD')

    if not USERNAME or not EMAIL or not PASSWORD:
        raise ValueError("Please provide the TWITTER_USERNAME, TWITTER_EMAIL and TWITTER_PASSWORD environment variables")

    client = Client()
    await client.login(
        auth_info_1=USERNAME,
        auth_info_2=EMAIL,
        password=PASSWORD
    )

    return client

@dataclass
class Tweet:
    id: str
    user_name: str
    user_screen_name: str
    created_at: dt.datetime
    text: str
    urls: Optional[List[str]] = None
    quote: Optional["Tweet"] = None

    def __str__(self):
        text = f"Tweet {self.id} from {self.user_name} (@{self.user_screen_name}) at {self.created_at}:\n"
        text += f"{self.text}\n"
        if self.urls:
            text += "\n---\nURLs:\n"
            for url, expanded_url in self.urls.items():
                text += f"{url} - {expanded_url}\n"

        if self.quote:
            text += f"\n---\nQuoted {str(self.quote)}\n"

        return text


class TweetScraper:
    def __init__(self, client: Client):
        self.client : Client = client

    def _extract_common(self, tweet) -> Tweet:
        user_name = tweet.user.name
        user_screen_name = tweet.user.screen_name
        created_at = tweet.created_at_datetime
        text = tweet.full_text

        return Tweet(id=tweet.id, user_name=user_name, user_screen_name=user_screen_name, created_at=created_at, text=text)

    async def extract_by_id(self, id: str) -> Tweet:
        tweet = await self.client.get_tweet_by_id(id)
        data = self._extract_common(tweet)

        urls = {}
        text = ""
        if tweet.urls:
            urls |= {url["url"]: url["expanded_url"] for url in tweet.urls}
        if tweet.media:
            urls |= {url["url"]: url["media_url_https"] for url in tweet.media}
            try:
                for url in tweet.media:
                    if url["type"] == "video":
                        video_url = url['video_info']['variants'][-1]['url']
                        video_path = f"{id}.mp4"
                        response = requests.get(video_url, stream=True)
                        response.raise_for_status()
                        with open(video_path, 'wb') as video_file:
                            for chunk in response.iter_content(chunk_size=8192):
                                if chunk:
                                    video_file.write(chunk)
                        print(f"Video saved to {video_path}")
            except:
                pass
        if tweet.quote:
            data.quote = self._extract_common(tweet.quote)

        data.urls = urls
        data.text += text

        print(data)

        return data


if __name__ == "__main__":
    import asyncio
    import nest_asyncio
    import argparse

    # Set up argument parser
    parser = argparse.ArgumentParser(description='Extract tweet by ID')
    parser.add_argument('tweet_id',  help='The ID of the tweet to extract')
    
    # Parse arguments
    args = parser.parse_args()
    tweet_id = args.tweet_id

    nest_asyncio.apply()

    client = asyncio.run(build_twikit_client())
    scraper = TweetScraper(client)
    
    asyncio.run(scraper.extract_by_id(tweet_id))