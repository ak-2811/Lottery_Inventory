# management/commands/update_jackpots.py
from django.core.management.base import BaseCommand
from inventory.models import JackpotValue
from inventory.utils.jackpot_fetcher import fetch_mega_millions, fetch_powerball

class Command(BaseCommand):
    help = "Fetch Mega Millions and Powerball jackpot values"

    def handle(self, *args, **kwargs):
        for fetcher in [fetch_mega_millions, fetch_powerball]:
            try:
                data = fetcher()
                self.stdout.write(f"Fetched raw result for {data['game_name']}: {data}")

                if data["amount_text"]:
                    JackpotValue.objects.update_or_create(
                        game_name=data["game_name"],
                        defaults={
                            "amount_text": data["amount_text"],
                            "amount_number": data["amount_number"],
                            "source_url": data["source_url"],
                        }
                    )
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Updated {data['game_name']}: {data['amount_text']}"
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Could not fetch {data['game_name']} - jackpot text not found"
                        )
                    )

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"Error while fetching {fetcher.__name__}: {str(e)}"
                    )
                )