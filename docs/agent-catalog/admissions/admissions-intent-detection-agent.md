# Admissions Intent Detection Agent

## Purpose
Applies admissions-specific intent thresholds to visitor IntentScores and updates the recommended_next_action on AdmissionsMemory. Maps score ranges to actionable recommendations for Maya and sales teams.

## Department
Admissions | Intelligence

## Status
Live | Trigger: cron (every 10 minutes)

## Input
- IntentScore records with score >= 20 (exploring threshold)

## Output
- Updated recommended_next_action on AdmissionsMemory for each visitor

## How It Works
1. Queries IntentScore records above the exploring threshold (score >= 20)
2. For each visitor with an AdmissionsMemory record, maps the score to a recommendation:
   - Score >= 80: Offer direct enrollment assistance
   - Score >= 60: Suggest booking a strategy call
   - Score >= 40: Share relevant case studies or ROI data
   - Score >= 20: Provide educational content
3. Updates recommended_next_action only when it changes

## Use Cases
- **Admissions**: Maya receives real-time guidance on conversation approach
- **Sales**: Counselors see prioritized action recommendations
- **Analytics**: Track intent distribution across the visitor pipeline

## Integration Points
- IntentScore model (score source)
- AdmissionsMemory (action recommendation storage)
