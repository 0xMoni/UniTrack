"""
UniTrack CLI

Command-line interface for UniTrack attendance tracker.
"""

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich import print as rprint

from ..core.config import (
    Config, load_config, save_config,
    Selectors, ERPConfig, Institution, Thresholds, Credentials,
    CONFIG_FILE, get_data_path
)

console = Console()


@click.group()
@click.version_option(version="1.0.0", prog_name="UniTrack")
def cli():
    """
    UniTrack - Universal Attendance Tracker

    Track your attendance from any university ERP system.

    Quick start:
      unitrack setup     # Configure your institution
      unitrack fetch     # Fetch attendance data
      unitrack status    # View attendance status
      unitrack serve     # Start web dashboard
    """
    pass


@cli.command()
def setup():
    """
    Interactive setup wizard.

    Configures UniTrack for your institution by:
    1. Getting your ERP URL
    2. Auto-discovering login selectors
    3. Finding attendance API
    4. Setting up thresholds
    """
    console.print(Panel.fit(
        "[bold blue]UniTrack Setup Wizard[/bold blue]\n"
        "Let's configure UniTrack for your institution.",
        border_style="blue"
    ))

    config = load_config()

    # Step 1: Institution details
    console.print("\n[bold]Step 1: Institution Details[/bold]")
    config.institution.name = Prompt.ask(
        "Institution name",
        default=config.institution.name or "My University"
    )
    config.institution.short_name = Prompt.ask(
        "Short name (optional)",
        default=config.institution.short_name or ""
    )

    # Step 2: ERP URL
    console.print("\n[bold]Step 2: ERP Configuration[/bold]")
    config.erp.base_url = Prompt.ask(
        "ERP login page URL",
        default=config.erp.base_url or "https://"
    )

    # Step 3: Credentials
    console.print("\n[bold]Step 3: Login Credentials[/bold]")
    config.credentials.username = Prompt.ask(
        "Username/Email",
        default=config.credentials.username
    )
    config.credentials.password = Prompt.ask(
        "Password",
        password=True
    )

    # Step 4: Auto-discover selectors
    console.print("\n[bold]Step 4: Auto-Discovery[/bold]")
    if Confirm.ask("Auto-discover login selectors and attendance API?", default=True):
        with console.status("[bold green]Discovering ERP structure..."):
            try:
                from playwright.sync_api import sync_playwright
                from ..core.discovery import ERPDiscovery

                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=False)
                    page = browser.new_page()

                    discovery = ERPDiscovery(page)

                    # Discover selectors
                    console.print("  Finding login selectors...")
                    selectors = discovery.discover_login_selectors(config.erp.base_url)

                    if selectors['username_input']:
                        config.erp.selectors = Selectors(**selectors)
                        console.print("  [green]Found login selectors![/green]")

                        # Try to discover attendance API
                        console.print("  Discovering attendance API...")
                        api_url, sample_data = discovery.discover_attendance_api(
                            config.credentials.username,
                            config.credentials.password,
                            selectors
                        )

                        if api_url:
                            config.erp.attendance_api = api_url
                            console.print(f"  [green]Found attendance API![/green]")

                            # Discover field mappings
                            mappings = discovery.discover_field_mappings(sample_data)
                            if mappings:
                                config.erp.field_mappings = mappings
                                console.print(f"  [green]Mapped {len(mappings)} fields[/green]")

                        # Try to get student info
                        student_info = discovery.discover_student_info()
                        if student_info:
                            config.student_name = student_info.get('name', '')
                            config.roll_number = student_info.get('roll', '')
                            config.branch = student_info.get('branch', '')
                            config.section = student_info.get('section', '')

                    browser.close()

            except Exception as e:
                console.print(f"  [yellow]Discovery error: {e}[/yellow]")
                console.print("  You can configure selectors manually later.")

    # Step 5: Thresholds
    console.print("\n[bold]Step 5: Attendance Thresholds[/bold]")
    default_threshold = Prompt.ask(
        "Default minimum attendance %",
        default=str(int(config.thresholds.default))
    )
    config.thresholds.default = float(default_threshold)

    if Confirm.ask("Add custom thresholds for specific subjects?", default=False):
        while True:
            keyword = Prompt.ask("Subject keyword (e.g., 'TYL', 'Lab')")
            threshold = Prompt.ask(f"Threshold for '{keyword}' subjects")
            config.thresholds.custom[keyword] = float(threshold)

            if not Confirm.ask("Add another?", default=False):
                break

    # Step 6: Student info (if not auto-discovered)
    if not config.student_name:
        console.print("\n[bold]Step 6: Student Information (optional)[/bold]")
        config.student_name = Prompt.ask("Your name", default="")
        config.roll_number = Prompt.ask("Roll number", default="")
        config.branch = Prompt.ask("Branch/Department", default="")
        config.section = Prompt.ask("Section", default="")

    # Save configuration
    save_config(config)
    console.print(f"\n[green]Configuration saved to {CONFIG_FILE}[/green]")

    # Summary
    console.print(Panel(
        f"[bold]Setup Complete![/bold]\n\n"
        f"Institution: {config.institution.name}\n"
        f"ERP URL: {config.erp.base_url}\n"
        f"Threshold: {config.thresholds.default}%\n\n"
        f"Next steps:\n"
        f"  [cyan]unitrack fetch[/cyan]  - Fetch your attendance\n"
        f"  [cyan]unitrack status[/cyan] - View attendance status\n"
        f"  [cyan]unitrack serve[/cyan]  - Start web dashboard",
        border_style="green"
    ))


@cli.command()
@click.option('--refresh', is_flag=True, help='Force refresh from ERP')
def fetch(refresh):
    """Fetch attendance data from ERP."""
    import os
    config = load_config()

    # Check basic config (without password)
    if not config.erp.base_url or not config.erp.selectors.is_complete():
        console.print("[red]UniTrack is not configured. Run 'unitrack setup' first.[/red]")
        return

    if not config.credentials.username:
        console.print("[red]No username configured. Run 'unitrack setup' first.[/red]")
        return

    # Get password from env or prompt
    if not config.credentials.password:
        config.credentials.password = os.getenv("UNITRACK_PASSWORD", "")

    if not config.credentials.password:
        config.credentials.password = Prompt.ask("Password", password=True)

    with console.status("[bold green]Fetching attendance..."):
        try:
            from ..core.scraper import fetch_attendance
            data = fetch_attendance(config)

            if data:
                console.print(f"[green]Fetched {len(data)} subjects![/green]")
            else:
                console.print("[yellow]No data fetched. Check your configuration.[/yellow]")

        except Exception as e:
            console.print(f"[red]Error: {e}[/red]")


@cli.command()
def status():
    """Display attendance status."""
    config = load_config()
    data_path = get_data_path('attendance.json')

    if not data_path.exists():
        console.print("[yellow]No attendance data. Run 'unitrack fetch' first.[/yellow]")
        return

    import json
    with open(data_path) as f:
        data = json.load(f)

    subjects = data.get('subjects', [])
    if not subjects:
        console.print("[yellow]No subjects found in data.[/yellow]")
        return

    # Analyze
    from ..core.calculator import AttendanceCalculator
    calc = AttendanceCalculator(config.thresholds)
    analysis = calc.analyze_all(subjects)

    # Display header
    console.print(Panel(
        f"[bold]{config.institution.name}[/bold]\n"
        f"{config.student_name} ({config.roll_number})" if config.student_name else "",
        border_style="blue"
    ))

    # Summary
    summary = analysis['summary']
    console.print(f"\n[bold]Overall: {summary['overall_percentage']}%[/bold] "
                 f"({summary['overall_present']}/{summary['overall_total']} classes)")

    status_colors = {'SAFE': 'green', 'CRITICAL': 'yellow', 'LOW': 'red'}
    console.print(f"Status: [{status_colors[summary['overall_status']]}]{summary['overall_status']}[/]")

    console.print(f"\n  [green]SAFE: {summary['safe_count']}[/green]  "
                 f"[yellow]CRITICAL: {summary['critical_count']}[/yellow]  "
                 f"[red]LOW: {summary['low_count']}[/red]")

    # Subject table
    table = Table(title="\nSubject-wise Attendance", show_header=True)
    table.add_column("Code", style="cyan")
    table.add_column("Subject")
    table.add_column("Attended", justify="right")
    table.add_column("%", justify="right")
    table.add_column("Status")
    table.add_column("Action")

    for subj in analysis['subjects']:
        status_style = status_colors.get(subj['status'], 'white')

        if subj['status'] == 'LOW':
            action = f"[red]Need {subj['classes_needed']}[/red]"
        elif subj['classes_can_miss'] > 0:
            action = f"[green]Can miss {subj['classes_can_miss']}[/green]"
        else:
            action = "[yellow]Attend all[/yellow]"

        table.add_row(
            subj['subject_code'],
            subj['subject'][:30] + "..." if len(subj['subject']) > 30 else subj['subject'],
            f"{subj['present']}/{subj['total']}",
            f"{subj['percentage']}%",
            f"[{status_style}]{subj['status']}[/]",
            action
        )

    console.print(table)

    # Last updated
    if 'timestamp' in data:
        console.print(f"\n[dim]Last updated: {data['timestamp']}[/dim]")


@cli.command()
@click.option('--port', default=5000, help='Port to run server on')
@click.option('--host', default='127.0.0.1', help='Host to bind to')
def serve(port, host):
    """Start web dashboard server."""
    config = load_config()

    console.print(Panel(
        f"[bold blue]UniTrack Web Dashboard[/bold blue]\n\n"
        f"Starting server at http://{host}:{port}",
        border_style="blue"
    ))

    try:
        from ..web.server import create_app
        app = create_app(config)
        app.run(host=host, port=port, debug=True)
    except ImportError:
        console.print("[red]Web module not available. Install with: pip install unitrack[web][/red]")
    except Exception as e:
        console.print(f"[red]Error starting server: {e}[/red]")


@cli.command()
def config():
    """Show current configuration."""
    cfg = load_config()

    console.print(Panel(
        f"[bold]UniTrack Configuration[/bold]\n"
        f"Config file: {CONFIG_FILE}",
        border_style="blue"
    ))

    console.print(f"\n[bold]Institution:[/bold] {cfg.institution.name}")
    console.print(f"[bold]ERP URL:[/bold] {cfg.erp.base_url}")
    console.print(f"[bold]Username:[/bold] {cfg.credentials.username}")
    console.print(f"[bold]Default Threshold:[/bold] {cfg.thresholds.default}%")

    if cfg.thresholds.custom:
        console.print(f"[bold]Custom Thresholds:[/bold]")
        for keyword, threshold in cfg.thresholds.custom.items():
            console.print(f"  {keyword}: {threshold}%")

    if cfg.student_name:
        console.print(f"\n[bold]Student:[/bold] {cfg.student_name} ({cfg.roll_number})")
        console.print(f"[bold]Branch:[/bold] {cfg.branch}")
        console.print(f"[bold]Section:[/bold] {cfg.section}")


if __name__ == '__main__':
    cli()
